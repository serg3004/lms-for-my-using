import { Injectable } from '@nestjs/common';
import type { ChecklistFeedbackVisibility, ChecklistGeolocationPolicy } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import type { UpdateChecklistWorkplaceSettingsInput } from './checklists.schemas.js';

export type ChecklistWorkplaceSettingsView = {
  organizationId: string;
  moduleEnabled: boolean;
  highPerformanceThreshold: number;
  criticalThreshold: number | null;
  lowThreshold: number | null;
  defaultGeolocationPolicy: ChecklistGeolocationPolicy;
  feedbackVisibility: ChecklistFeedbackVisibility;
  updatedAt: Date | null;
};

/**
 * Safe defaults per docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md — returned as-is for any
 * tenant that has never written its own settings row, so callers never have to special-case "no row yet".
 * criticalThreshold/lowThreshold stay null: DEC-CHKS-001 (docs/status/OPEN_DECISIONS.md) defers a concrete
 * value to an owner decision, this is not an oversight.
 */
const DEFAULT_SETTINGS: Omit<ChecklistWorkplaceSettingsView, 'organizationId' | 'updatedAt'> = {
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

  async getSettings(organizationId: string): Promise<ChecklistWorkplaceSettingsView> {
    const existing = await this.prisma.checklistWorkplaceSettings.findUnique({ where: { organizationId } });
    if (!existing) return { organizationId, updatedAt: null, ...DEFAULT_SETTINGS };

    return {
      organizationId,
      moduleEnabled: existing.moduleEnabled,
      highPerformanceThreshold: existing.highPerformanceThreshold,
      criticalThreshold: existing.criticalThreshold,
      lowThreshold: existing.lowThreshold,
      defaultGeolocationPolicy: existing.defaultGeolocationPolicy,
      feedbackVisibility: existing.feedbackVisibility,
      updatedAt: existing.updatedAt,
    };
  }

  async updateSettings(
    organizationId: string,
    input: UpdateChecklistWorkplaceSettingsInput,
    actorId: string | null,
  ): Promise<ChecklistWorkplaceSettingsView> {
    const updated = await this.prisma.checklistWorkplaceSettings.upsert({
      where: { organizationId },
      create: { organizationId, ...DEFAULT_SETTINGS, ...input },
      update: { ...input },
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist_workplace_settings.updated',
      targetType: 'checklist_workplace_settings',
      targetId: organizationId,
      summary: 'Updated checklist workplace-training settings',
    });

    return {
      organizationId,
      moduleEnabled: updated.moduleEnabled,
      highPerformanceThreshold: updated.highPerformanceThreshold,
      criticalThreshold: updated.criticalThreshold,
      lowThreshold: updated.lowThreshold,
      defaultGeolocationPolicy: updated.defaultGeolocationPolicy,
      feedbackVisibility: updated.feedbackVisibility,
      updatedAt: updated.updatedAt,
    };
  }
}
