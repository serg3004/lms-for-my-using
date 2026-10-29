import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  ChecklistFeedbackVisibility, ChecklistGeolocationPolicy, ChecklistObserverEligibility,
  ChecklistWorkplaceSettings, UserRole, User,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { runSerializableWithRetry } from '../departments/public.js';
import { DEFAULT_OBSERVER_SELECTION } from './checklist-observer-eligibility.js';
import type { UpdateChecklistWorkplaceSettingsInput } from './checklists.schemas.js';

export type ChecklistWorkplaceSettingsView = {
  organizationId: string;
  moduleEnabled: boolean;
  highPerformanceThreshold: number;
  criticalThreshold: number | null;
  lowThreshold: number | null;
  defaultGeolocationPolicy: ChecklistGeolocationPolicy;
  feedbackVisibility: ChecklistFeedbackVisibility;
  observerEligibility: ChecklistObserverEligibility;
  observerRoles: UserRole[];
  observerUserIds: string[];
  selectedObserverUsers?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'status'>[];
  updatedAt: Date | null;
};

/**
 * Safe defaults per docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md — returned as-is for any
 * tenant that has never written its own settings row, so callers never have to special-case "no row yet".
 * criticalThreshold/lowThreshold stay null: DEC-CHKS-001 (docs/status/OPEN_DECISIONS.md) defers a concrete
 * value to an owner decision, this is not an oversight.
 */
const DEFAULT_SETTINGS: Omit<ChecklistWorkplaceSettingsView, 'organizationId' | 'updatedAt'> = {
  ...DEFAULT_OBSERVER_SELECTION,
  moduleEnabled: false,
  highPerformanceThreshold: 90,
  criticalThreshold: null,
  lowThreshold: null,
  defaultGeolocationPolicy: 'off',
  feedbackVisibility: 'after_completion',
};

@Injectable()
export class ChecklistWorkplaceSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
  ) {}

  private present(organizationId: string, row: ChecklistWorkplaceSettings | null): ChecklistWorkplaceSettingsView {
    if (!row) return { organizationId, updatedAt: null, ...DEFAULT_SETTINGS };
    return {
      organizationId,
      moduleEnabled: row.moduleEnabled,
      highPerformanceThreshold: row.highPerformanceThreshold,
      criticalThreshold: row.criticalThreshold,
      lowThreshold: row.lowThreshold,
      defaultGeolocationPolicy: row.defaultGeolocationPolicy,
      feedbackVisibility: row.feedbackVisibility,
      observerEligibility: row.observerEligibility,
      observerRoles: row.observerRoles,
      observerUserIds: row.observerUserIds,
      updatedAt: row.updatedAt,
    };
  }

  async getSettings(organizationId: string, includeSelectedUsers = false): Promise<ChecklistWorkplaceSettingsView> {
    const row = await this.prisma.checklistWorkplaceSettings.findUnique({ where: { organizationId } });
    const settings = this.present(organizationId, row);
    // Names are needed by the admin editor only; ordinary settings readers receive no roster PII.
    if (includeSelectedUsers) {
      settings.selectedObserverUsers = settings.observerUserIds.length ? await this.prisma.user.findMany({
        where: { organizationId, id: { in: settings.observerUserIds }, deletedAt: null },
        select: { id: true, firstName: true, lastName: true, email: true, status: true },
      }) : [];
    }
    return settings;
  }

  /**
   * PR 365: the observer-eligibility fields are access settings. A request that merely repeats the stored
   * value is not a change (a form of a non-admin sends the whole object), only a different value is.
   */
  async changesAccessSettings(organizationId: string, input: UpdateChecklistWorkplaceSettingsInput): Promise<boolean> {
    if (input.observerEligibility === undefined && input.observerRoles === undefined && input.observerUserIds === undefined) return false;
    const current = this.present(organizationId, await this.prisma.checklistWorkplaceSettings.findUnique({ where: { organizationId } }));
    const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value) => b.includes(value));
    return (input.observerEligibility !== undefined && input.observerEligibility !== current.observerEligibility)
      || (input.observerRoles !== undefined && !sameSet(input.observerRoles, current.observerRoles))
      || (input.observerUserIds !== undefined && !sameSet(input.observerUserIds, current.observerUserIds));
  }

  async updateSettings(
    organizationId: string,
    input: UpdateChecklistWorkplaceSettingsInput,
    actorId: string | null,
  ): Promise<ChecklistWorkplaceSettingsView> {
    const { previous, updated } = await runSerializableWithRetry(this.prisma, async (tx) => {
      const previous = this.present(organizationId, await tx.checklistWorkplaceSettings.findUnique({ where: { organizationId } }));
      const addedIds = input.observerUserIds?.filter((id) => !previous.observerUserIds.includes(id)) ?? [];
      if (addedIds.length) {
        const count = await tx.user.count({ where: { organizationId, id: { in: addedIds }, deletedAt: null, status: 'active' } });
        if (count !== addedIds.length) throw new BadRequestException('Selected observers must be active users in this organization');
      }
      const row = await tx.checklistWorkplaceSettings.upsert({
        where: { organizationId },
        create: { organizationId, ...DEFAULT_SETTINGS, ...input },
        update: { ...input },
      });
      return { previous, updated: this.present(organizationId, row) };
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist_workplace_settings.updated',
      targetType: 'checklist_workplace_settings',
      targetId: organizationId,
      summary: 'Updated checklist workplace-training settings',
      metadata: { previous: { ...previous, updatedAt: previous.updatedAt?.toISOString() ?? null }, updated: { ...updated, updatedAt: updated.updatedAt?.toISOString() ?? null } },
    });
    return updated;
  }
}
