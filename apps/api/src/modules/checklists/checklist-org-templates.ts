import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ChecklistGeolocationPolicy, ChecklistPreSessionVisibility, Prisma } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service.js';
import type { AuditLogService } from '../audit-log/public.js';
import { overridesToColumns, presentOverrides, type ModuleSettingsOverridesView } from './checklist-settings-overrides.js';

export const MAX_ORG_TEMPLATES = 100;

type PayloadItem = {
  groupIndex: number | null; order: number; text: string; points: number; isRequired: boolean; photoRequired: boolean;
  weight: number | null; allowSkip: boolean; autoSkipUnanswered: boolean; scaleId: string | null;
};
/** Frozen copy of a checklist: settings, groups and criteria. Never references the source row. */
export type ChecklistTemplatePayload = {
  scoringMode: 'sum_points' | 'all_required' | 'scale';
  passThreshold: number;
  scaleLevels: Prisma.JsonValue | null;
  requiresReview: boolean;
  contextFields: Prisma.JsonValue | null;
  defaultLocationCapturePolicy: ChecklistGeolocationPolicy | null;
  preSessionVisibility: ChecklistPreSessionVisibility;
  allowFinishIncomplete: boolean;
  forbidGalleryPhotos: boolean;
  // PR 368: templates saved before it have no such keys and read as the defaults.
  feedbackEnabled?: boolean;
  feedbackRequired?: boolean;
  allowSkipAll?: boolean;
  // PR 397: per-sheet module-settings overrides; templates saved before it have none (= as in the organization).
  moduleSettings?: ModuleSettingsOverridesView;
  groups: Array<{ title: string; order: number }>;
  items: PayloadItem[];
};

const summarySelect = { id: true, title: true, description: true, groupCount: true, itemCount: true, createdAt: true, updatedAt: true } as const;

/** PR 367: templates of the organization. Only an administrator changes them; everyone who builds sheets can start from one. */
export class ChecklistOrgTemplates {
  constructor(private readonly prisma: PrismaService, private readonly auditLog: AuditLogService) {}

  async list(organizationId: string) {
    return this.prisma.checklistTemplate.findMany({ where: { organizationId, deletedAt: null }, orderBy: { title: 'asc' }, select: summarySelect });
  }

  /** Saves a frozen copy of an existing checklist. */
  async create(organizationId: string, input: { sourceChecklistId: string; title?: string; description?: string | null }, actorId: string) {
    const source = await this.prisma.checklist.findFirst({
      where: { id: input.sourceChecklistId, organizationId, deletedAt: null },
      include: { itemGroups: { orderBy: { order: 'asc' } }, items: { where: { deletedAt: null }, orderBy: { order: 'asc' } } },
    });
    if (!source) throw new NotFoundException('Checklist not found');
    if ((await this.prisma.checklistTemplate.count({ where: { organizationId, deletedAt: null } })) >= MAX_ORG_TEMPLATES) {
      throw new ConflictException(`At most ${MAX_ORG_TEMPLATES} templates per organization`);
    }
    const groupIndex = new Map(source.itemGroups.map((group, index) => [group.id, index]));
    const payload: ChecklistTemplatePayload = {
      scoringMode: source.scoringMode,
      passThreshold: source.passThreshold,
      scaleLevels: (source.scaleLevels as Prisma.JsonValue | null) ?? null,
      requiresReview: source.requiresReview,
      contextFields: (source.contextFields as Prisma.JsonValue | null) ?? null,
      defaultLocationCapturePolicy: source.defaultLocationCapturePolicy,
      preSessionVisibility: source.preSessionVisibility,
      allowFinishIncomplete: source.allowFinishIncomplete,
      forbidGalleryPhotos: source.forbidGalleryPhotos,
      feedbackEnabled: source.feedbackEnabled,
      feedbackRequired: source.feedbackRequired,
      allowSkipAll: source.allowSkipAll,
      moduleSettings: presentOverrides(source),
      groups: source.itemGroups.map((group) => ({ title: group.title, order: group.order })),
      items: source.items.map((item) => ({
        groupIndex: item.groupId ? groupIndex.get(item.groupId) ?? null : null, order: item.order, text: item.text, points: item.points,
        isRequired: item.isRequired, photoRequired: item.photoRequired, weight: item.weight, allowSkip: item.allowSkip,
        autoSkipUnanswered: item.autoSkipUnanswered, scaleId: item.scaleId,
      })),
    };
    const created = await this.prisma.checklistTemplate.create({
      data: {
        organizationId,
        title: input.title ?? source.title,
        description: input.description === undefined ? source.description : input.description,
        payload: payload as unknown as Prisma.InputJsonValue,
        groupCount: payload.groups.length,
        itemCount: payload.items.length,
        createdBy: actorId,
      },
      select: summarySelect,
    });
    await this.auditLog.record({
      organizationId, actorId, action: 'checklist_template.created', targetType: 'checklist_template', targetId: created.id,
      summary: `Saved checklist ${source.title} as a template`, metadata: { sourceChecklistId: source.id },
    });
    return created;
  }

  async update(templateId: string, organizationId: string, input: { title?: string; description?: string | null }, actorId: string) {
    const updated = await this.prisma.checklistTemplate.updateMany({
      where: { id: templateId, organizationId, deletedAt: null },
      data: { ...(input.title !== undefined ? { title: input.title } : {}), ...(input.description !== undefined ? { description: input.description } : {}) },
    });
    if (updated.count === 0) throw new NotFoundException('Checklist template not found');
    await this.auditLog.record({
      organizationId, actorId, action: 'checklist_template.updated', targetType: 'checklist_template', targetId: templateId,
      summary: 'Updated a checklist template', metadata: { fields: Object.keys(input) },
    });
    return this.prisma.checklistTemplate.findFirstOrThrow({ where: { id: templateId, organizationId }, select: summarySelect });
  }

  async remove(templateId: string, organizationId: string, actorId: string) {
    const removed = await this.prisma.checklistTemplate.updateMany({ where: { id: templateId, organizationId, deletedAt: null }, data: { deletedAt: new Date() } });
    if (removed.count === 0) throw new NotFoundException('Checklist template not found');
    await this.auditLog.record({
      organizationId, actorId, action: 'checklist_template.deleted', targetType: 'checklist_template', targetId: templateId,
      summary: 'Deleted a checklist template', metadata: {},
    });
  }

  /** A new draft from the template: one transaction, nothing shared with the template afterwards. */
  async createChecklist(templateId: string, organizationId: string, actorId: string) {
    const template = await this.prisma.checklistTemplate.findFirst({ where: { id: templateId, organizationId, deletedAt: null } });
    if (!template) throw new NotFoundException('Checklist template not found');
    const payload = template.payload as unknown as ChecklistTemplatePayload;
    const scaleIds = payload.items.map((item) => item.scaleId).filter((id): id is string => !!id);
    // A scale deleted since the template was saved simply drops off the criterion.
    const liveScales = new Set(
      scaleIds.length ? (await this.prisma.checklistScale.findMany({ where: { organizationId, id: { in: scaleIds } }, select: { id: true } })).map((scale) => scale.id) : [],
    );

    const checklistId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.checklist.create({
        data: {
          organizationId, title: template.title, description: template.description, status: 'draft',
          scoringMode: payload.scoringMode, passThreshold: payload.passThreshold,
          scaleLevels: (payload.scaleLevels as Prisma.InputJsonValue | null) ?? undefined,
          requiresReview: payload.requiresReview,
          contextFields: (payload.contextFields as Prisma.InputJsonValue | null) ?? undefined,
          defaultLocationCapturePolicy: payload.defaultLocationCapturePolicy,
          preSessionVisibility: payload.preSessionVisibility,
          allowFinishIncomplete: payload.allowFinishIncomplete, forbidGalleryPhotos: payload.forbidGalleryPhotos,
          feedbackEnabled: payload.feedbackEnabled ?? true, feedbackRequired: payload.feedbackRequired ?? false, allowSkipAll: payload.allowSkipAll ?? false,
          ...(payload.moduleSettings ? overridesToColumns({ thresholds: payload.moduleSettings.thresholds, resultColors: payload.moduleSettings.resultColors, feedbackVisibility: payload.moduleSettings.feedbackVisibility, observers: payload.moduleSettings.observers }) as Prisma.ChecklistUncheckedCreateInput : {}),
          createdBy: actorId,
        },
        select: { id: true },
      });
      const groupIds: string[] = [];
      for (const group of payload.groups) {
        groupIds.push((await tx.checklistItemGroup.create({ data: { organizationId, checklistId: created.id, title: group.title, order: group.order }, select: { id: true } })).id);
      }
      for (const item of payload.items) {
        await tx.checklistItem.create({
          data: {
            organizationId, checklistId: created.id, groupId: item.groupIndex === null ? null : groupIds[item.groupIndex] ?? null,
            order: item.order, text: item.text, points: item.points, isRequired: item.isRequired, photoRequired: item.photoRequired,
            weight: item.weight ?? undefined, allowSkip: item.allowSkip, autoSkipUnanswered: item.autoSkipUnanswered,
            scaleId: item.scaleId && liveScales.has(item.scaleId) ? item.scaleId : null,
          },
        });
      }
      return created.id;
    });
    await this.auditLog.record({
      organizationId, actorId, action: 'checklist.created_from_org_template', targetType: 'checklist', targetId: checklistId,
      summary: `Created checklist from template ${template.title}`, metadata: { templateId },
    });
    return checklistId;
  }
}
