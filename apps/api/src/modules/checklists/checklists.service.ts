import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { UploadService } from '../upload/public.js';
import { withResolvedLevelColors } from './checklist-colors.js';
import { ChecklistScaleService } from './checklist-scale.service.js';
import { performanceBand, type ManagerPerformanceBand } from './checklist-performance-band.js';
import { managerExportRows, employeeExportRows, exportLocale, MAX_EXPORT_ROWS, serializeReportCsv, viewEmployees } from './checklist-report-csv.js';
import { ChecklistOrgTemplates } from './checklist-org-templates.js';
import { assertObserversBelongToOrganization, freezeReportSettings, loadEffectiveSettings, overridesToColumns, presentOverrides, presentStaffChecklist, SHEET_OVERRIDES_SELECT } from './checklist-settings-overrides.js';
import { ChecklistBulkActions, type ChecklistBulkAction } from './checklist-bulk-actions.js';
import { visibleFolderIds, type FolderActor } from './checklist-folder-tree.js';
import { ChecklistResultDeletion } from './checklist-result-deletion.js';
import { findTemplate, renderTemplate, templateLocale } from './checklist-templates.js';
import {
  AssignChecklistInput,
  ChecklistScoreFormula,
  BulkAssignChecklistInput,
  ChecklistAnalyticsQuery,
  ChecklistManagerAnalyticsExportQuery,
  ChecklistManagerAnalyticsQuery,
  ChecklistModuleSettingsInput,
  ChecklistListQuery,
  ChecklistQueueQuery,
  ContextField,
  CreateChecklistInput,
  CreateChecklistItemGroupInput,
  CreateChecklistItemInput,
  ReviewChecklistItemResultInput,
  ScaleLevel,
  SkipChecklistItemInput,
  SubmitChecklistItemResultInput,
  UpdateChecklistInput,
  UpdateChecklistItemGroupInput,
  UpdateChecklistItemInput,
  MAX_BULK_CHECKLIST_RECIPIENTS,
} from './checklists.schemas.js';
import {
  CHECKLIST_EXPIRED_MESSAGE,
  expireDueChecklistInstances,
  isChecklistDeadlineReached,
} from './checklist-deadlines.js';

const CHECKLIST_SNAPSHOT_VERSION = 1;

/**
 * Exported so callers (e.g. ChecklistSessionService.bulkCreate) can distinguish this specific,
 * per-recipient-skippable conflict from every other BadRequestException assignChecklist can
 * throw (e.g. "checklist is not published"), which are request-level validation failures that
 * must abort the whole batch, not silently skip every recipient.
 */
const ACTIVE_INSTANCE_STATUSES = ['assigned', 'in_progress', 'submitted'] as const;
/** PR 354: how many free checklists can be pinned to the learner pages at once (matches the prototype). */
export const MAX_PINNED_CHECKLISTS = 8;
export const PINNED_LIMIT_MESSAGE = `At most ${MAX_PINNED_CHECKLISTS} checklists can be pinned. Unpin another checklist first.`;
export const ACTIVE_ASSIGNMENT_CONFLICT_MESSAGE = 'This user already has an active assignment for this checklist';

type AnalyticsRow = {
  status: string;
  scheduledAt: Date | null;
  self: boolean;
  instance: { userId: string; checklistId: string; status: string; percentage: number; passed: boolean; scored: boolean };
};

export type ManagerAnalyticsEmployeeRow = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string | null;
  departmentId: string | null;
  sessionsCount: number;
  completedCount: number;
  averagePercentage: number | null;
  trend: 'up' | 'down' | 'flat' | null;
  /** PR 350: band of the employee's average against the thresholds; null without a completed scored session. */
  performance: ManagerPerformanceBand | null;
  lastSessionAt: string | null;
};

export type ManagerAnalyticsManagerRow = {
  managerId: string | null;
  name: string | null;
  employeesCount: number;
  completedCount: number;
  averagePercentage: number | null;
};

export type ManagerAnalyticsDepartmentRow = {
  departmentId: string;
  name: string;
  employeesCount: number;
  sessionsCount: number;
  completedCount: number;
  averagePercentage: number | null;
  noCompletionCount: number;
};

const checklistSelect = {
  id: true,
  organizationId: true,
  title: true,
  description: true,
  status: true,
  scoringMode: true,
  passThreshold: true,
  scaleLevels: true,
  requiresReview: true,
  // PR 296 observation-sheet builder settings.
  contextFields: true,
  defaultLocationCapturePolicy: true,
  preSessionVisibility: true,
  allowFinishIncomplete: true,
  forbidGalleryPhotos: true,
  feedbackEnabled: true,
  feedbackRequired: true,
  allowSkipAll: true,
  accessMode: true,
  pinned: true,
  allowEditByAll: true,
  coverUpdatedAt: true,
  folderId: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

const checklistWithGroupsSelect = {
  ...checklistSelect,
  itemGroups: {
    orderBy: { order: 'asc' as const },
    select: { id: true, checklistId: true, title: true, order: true },
  },
} as const;

const checklistWithItemsSelect = {
  ...checklistWithGroupsSelect,
  items: {
    where: { deletedAt: null },
    orderBy: { order: 'asc' as const },
    select: {
      id: true,
      checklistId: true,
      order: true,
      text: true,
      points: true,
      isRequired: true,
      photoRequired: true,
      weight: true,
      allowSkip: true,
      autoSkipUnanswered: true,
      scaleId: true,
      groupId: true,
    },
  },
} as const;

/** PR 397: staff-facing reads also carry the sheet's module-settings overrides; the learner-facing instance select does not. */
const staffChecklistSelect = { ...checklistWithItemsSelect, ...SHEET_OVERRIDES_SELECT } as const;

const instanceSelect = {
  id: true,
  organizationId: true,
  checklistId: true,
  userId: true,
  assignedBy: true,
  reviewerId: true,
  reviewAssignedAt: true,
  reviewAssignedBy: true,
  status: true,
  totalScore: true,
  maxScore: true,
  percentage: true,
  passed: true,
  scored: true,
  dueAt: true,
  submittedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const instanceWithResultsSelect = {
  ...instanceSelect,
  checklist: { select: checklistWithItemsSelect },
  results: {
    select: {
      id: true,
      itemId: true,
      checked: true,
      scaleLevel: true,
      points: true,
      photoUrl: true,
      photoFileName: true,
      comment: true,
      answerState: true,
      reviewStatus: true,
      reviewComment: true,
      reviewedBy: true,
      reviewedAt: true,
    },
  },
} as const;

const instanceWithSnapshotSelect = {
  ...instanceWithResultsSelect,
  templateSnapshot: true,
  snapshotVersion: true,
} as const;

type ItemScaleRef = { scale?: ChecklistSnapshotItemScale | null };
type ScoringItem = ItemScaleRef & { id: string; points: number; isRequired: boolean; weight?: number };
type CompletionItem = ItemScaleRef & { id: string; isRequired: boolean; photoRequired: boolean; autoSkipUnanswered?: boolean };
type CompletionResult = {
  itemId: string;
  checked: boolean;
  scaleLevel: number | null;
  points?: number;
  photoObjectKey: string | null;
  reviewStatus: string;
  answerState?: string;
};
type ChecklistSnapshotItemScale = {
  id: string;
  name: string;
  // `color` is frozen with the levels (PR 369б); snapshots taken earlier have none and read as the default.
  levels: Array<{ value: number; label: string; score: number; color?: string }>;
};
type ChecklistSnapshotItemGroup = { id: string; checklistId: string; title: string; order: number };
type ChecklistSnapshotItem = {
  id: string;
  checklistId: string;
  order: number;
  text: string;
  points: number;
  isRequired: boolean;
  photoRequired: boolean;
  // Optional: snapshots taken before PR 290 don't have these — every reader falls back to the
  // pre-PR-290 defaults (weight 1, not skippable) rather than throwing on old in-flight instances.
  weight?: number;
  allowSkip?: boolean;
  autoSkipUnanswered?: boolean;
  // PR 293: raw FK plus the resolved scale payload as it looked at snapshot time -- both optional
  // since snapshots taken before PR 293 (and any item that never referenced a scale) have neither.
  // Readers must use `scale` (the immutable copy), never re-resolve `scaleId` against the live
  // ChecklistScale table, or an edited/archived scale would silently change a historical instance.
  scaleId?: string | null;
  scale?: ChecklistSnapshotItemScale | null;
  groupId?: string | null;
};
type ChecklistRuntime = {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  status: string;
  scoringMode: string;
  passThreshold: number;
  scaleLevels: ScaleLevel[] | null;
  requiresReview: boolean;
  // PR 296 observation-sheet builder settings -- optional because a snapshot built before this PR
  // never had them; new snapshots freeze them here so a later edit to the live checklist can't
  // retroactively change what an already-assigned instance's observer sees, same as scaleLevels.
  contextFields?: ContextField[] | null;
  defaultLocationCapturePolicy?: string | null;
  preSessionVisibility?: string;
  // PR 330 -- optional for the same reason: older snapshots never had them and read as false.
  allowFinishIncomplete?: boolean;
  forbidGalleryPhotos?: boolean;
  // PR 368 -- optional too: older snapshots read as feedback on, optional, no sheet-level skip.
  feedbackEnabled?: boolean;
  feedbackRequired?: boolean;
  allowSkipAll?: boolean;
  itemGroups?: ChecklistSnapshotItemGroup[];
  items: ChecklistSnapshotItem[];
};
type ChecklistTemplateSnapshot = {
  version: typeof CHECKLIST_SNAPSHOT_VERSION;
  checklist: ChecklistRuntime;
};
type SnapshotInstance = Prisma.ChecklistInstanceGetPayload<{ select: typeof instanceWithSnapshotSelect }>;
type SnapshotRuntimeRef = {
  checklistId: string;
  templateSnapshot?: Prisma.JsonValue | null;
  snapshotVersion?: number | null;
};
type WritableInstance = {
  session?: { observerId: string; deletedAt: Date | null } | null;
  id: string;
  userId: string;
  status: string;
  dueAt: Date | null;
};

/** PR 368: a required feedback section only makes sense while the feedback section is shown. */
export function assertFeedbackSettingsConsistent(feedbackEnabled: boolean, feedbackRequired: boolean) {
  if (feedbackRequired && !feedbackEnabled) {
    throw new BadRequestException('feedbackRequired needs feedbackEnabled to also be true');
  }
}

@Injectable()
export class ChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
    private readonly scaleService: ChecklistScaleService = new ChecklistScaleService(prisma, auditLog),
  ) {
    // Plain helpers, not providers: built here so Nest does not try to inject them.
    this.resultDeletion = new ChecklistResultDeletion(prisma, auditLog);
    this.orgTemplates = new ChecklistOrgTemplates(prisma, auditLog);
    this.bulkActions = new ChecklistBulkActions(prisma, auditLog, {
      setStatus: (id, organizationId, status, actorId) => this.updateChecklist(id, organizationId, { status }, actorId),
      remove: (id, organizationId, actorId) => this.deleteChecklist(id, organizationId, actorId),
      setFolder: (id, organizationId, folderId, actorId) => this.updateChecklist(id, organizationId, { folderId }, actorId),
    });
  }

  private readonly resultDeletion: ChecklistResultDeletion;
  private readonly orgTemplates: ChecklistOrgTemplates;
  private readonly bulkActions: ChecklistBulkActions;

  /** PR 394: bulk archive / draft / publish / delete with per-sheet outcomes. */
  bulkAction(action: ChecklistBulkAction, ids: readonly string[], organizationId: string, actor: { id: string; roles: readonly string[] }, folderId: string | null = null) {
    return this.bulkActions.run(action, ids, organizationId, actor, folderId);
  }

  /** PR 372: photo bytes for the report PDF; null when the object is missing or over the limit. */
  readPhotoBytes(objectKey: string, maxBytes: number) { return this.uploadService.getObjectBytes(objectKey, maxBytes); }

  // ---- PR 367: administrator-only deletion of results and organization templates ----
  deleteResult(instanceId: string, organizationId: string, reason: string, actorId: string) { return this.resultDeletion.delete(instanceId, organizationId, reason, actorId); }
  restoreResult(instanceId: string, organizationId: string, actorId: string) { return this.resultDeletion.restore(instanceId, organizationId, actorId); }
  listDeletedResults(organizationId: string) { return this.resultDeletion.listDeleted(organizationId); }
  listOrgTemplates(organizationId: string) { return this.orgTemplates.list(organizationId); }
  createOrgTemplate(organizationId: string, input: Parameters<ChecklistOrgTemplates['create']>[1], actorId: string) { return this.orgTemplates.create(organizationId, input, actorId); }
  updateOrgTemplate(templateId: string, organizationId: string, input: Parameters<ChecklistOrgTemplates['update']>[2], actorId: string) { return this.orgTemplates.update(templateId, organizationId, input, actorId); }
  deleteOrgTemplate(templateId: string, organizationId: string, actorId: string) { return this.orgTemplates.remove(templateId, organizationId, actorId); }
  async createFromOrgTemplate(templateId: string, organizationId: string, actorId: string) {
    const checklistId = await this.orgTemplates.createChecklist(templateId, organizationId, actorId);
    return presentStaffChecklist(await this.prisma.checklist.findFirstOrThrow({ where: { id: checklistId, organizationId }, select: staffChecklistSelect }));
  }

  // ---- Templates ----

  async listChecklists(organizationId: string, status?: ChecklistListQuery['status'], actor?: FolderActor) {
    // PR 395: sheets of a folder the actor may not see are left out of the list (assignments, sessions and reports are not affected).
    const hiddenFolderIds = actor && !actor.roles.includes('admin') ? await this.hiddenFolderIds(organizationId, actor) : [];
    const rows = await this.prisma.checklist.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(hiddenFolderIds.length > 0 ? { OR: [{ folderId: null }, { folderId: { notIn: hiddenFolderIds } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      // PR 393: the list shows who created the sheet; a deleted author reads as null (creator relation is SetNull).
      select: { ...staffChecklistSelect, creator: { select: { id: true, firstName: true, lastName: true } } },
    });
    return rows.map((row) => presentStaffChecklist(row));
  }

  /** PR 395: the target folder of a move (null = root) must exist in the organization and be visible to the actor. */
  async assertCanPlaceInFolder(folderId: string | null, organizationId: string, actor: FolderActor) {
    if (folderId === null) return;
    const folders = await this.prisma.checklistFolder.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, parentId: true, createdBy: true, visibleToStaff: true } });
    if (!folders.some((folder) => folder.id === folderId) || !visibleFolderIds(folders, actor).has(folderId)) {
      throw new NotFoundException('Folder not found');
    }
  }

  private async hiddenFolderIds(organizationId: string, actor: FolderActor) {
    const folders = await this.prisma.checklistFolder.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, parentId: true, createdBy: true, visibleToStaff: true } });
    const visible = visibleFolderIds(folders, actor);
    return folders.filter((folder) => !visible.has(folder.id)).map((folder) => folder.id);
  }

  /**
   * PR 397: who may observe a sheet is an access setting (as for the organization, PR 365): only an administrator
   * changes it. Resending the stored value is not a change, so a form of a non-admin editor may carry it along.
   */
  async changesSheetObservers(checklistId: string, organizationId: string, observers: ChecklistModuleSettingsInput['observers']): Promise<boolean> {
    if (observers === undefined) return false;
    const sheet = await this.prisma.checklist.findFirst({ where: { id: checklistId, organizationId, deletedAt: null }, select: SHEET_OVERRIDES_SELECT });
    if (!sheet) throw new NotFoundException('Checklist not found');
    const current = presentOverrides(sheet).observers;
    if (observers === null || current === null) return observers !== current;
    const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value) => b.includes(value));
    return observers.eligibility !== current.eligibility || !same(observers.roles, current.roles) || !same(observers.userIds, current.userIds);
  }

  /** PR 397: the sheets that override the organization's feedback visibility (checklist id -> value). */
  async feedbackVisibilityOverrides(organizationId: string) {
    const rows = await this.prisma.checklist.findMany({
      where: { organizationId, feedbackVisibilityOverride: { not: null } },
      select: { id: true, feedbackVisibilityOverride: true },
    });
    return new Map(rows.map((row) => [row.id, row.feedbackVisibilityOverride!] as const));
  }

  async getChecklist(checklistId: string, organizationId: string) {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, organizationId, deletedAt: null },
      select: staffChecklistSelect,
    });

    if (!checklist) {
      throw new NotFoundException('Checklist not found');
    }

    return presentStaffChecklist(checklist);
  }

  /**
   * PR 355: stores the uploaded cover as the checklist's only cover. The previous object is removed
   * best-effort afterwards: a failed delete leaves an orphan in storage, never a broken checklist.
   */
  async replaceCover(
    checklistId: string,
    organizationId: string,
    actorId: string,
    uploaded: { objectKey: string; mimeType: string },
  ) {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, organizationId, deletedAt: null },
      select: { id: true, title: true, coverObjectKey: true },
    });
    if (!checklist) {
      throw new NotFoundException('Checklist not found');
    }

    const updated = await this.prisma.checklist.update({
      where: { id: checklistId },
      data: { coverObjectKey: uploaded.objectKey, coverMimeType: uploaded.mimeType, coverUpdatedAt: new Date() },
      select: { id: true, coverUpdatedAt: true },
    });
    if (checklist.coverObjectKey) {
      await this.uploadService.deleteObject(checklist.coverObjectKey).catch(() => undefined);
    }
    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist.cover_updated',
      targetType: 'checklist',
      targetId: checklistId,
      summary: `Updated cover of checklist ${checklist.title}`,
    });
    return updated;
  }

  async removeCover(checklistId: string, organizationId: string, actorId: string) {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, organizationId, deletedAt: null },
      select: { id: true, title: true, coverObjectKey: true },
    });
    if (!checklist) {
      throw new NotFoundException('Checklist not found');
    }
    if (!checklist.coverObjectKey) {
      return { id: checklistId, coverUpdatedAt: null };
    }

    await this.prisma.checklist.update({
      where: { id: checklistId },
      data: { coverObjectKey: null, coverMimeType: null, coverUpdatedAt: null },
    });
    await this.uploadService.deleteObject(checklist.coverObjectKey).catch(() => undefined);
    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist.cover_removed',
      targetType: 'checklist',
      targetId: checklistId,
      summary: `Removed cover of checklist ${checklist.title}`,
    });
    return { id: checklistId, coverUpdatedAt: null };
  }

  /**
   * PR 355: short-lived signed URL for the cover. Staff see any checklist of their organization; a
   * learner only sees the cover of a published free checklist or of one assigned to them, so a
   * draft cover or another tenant's cover is a plain 404.
   */
  async getCoverDownload(checklistId: string, organizationId: string, userId: string, isPrivileged: boolean) {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, organizationId, deletedAt: null },
      select: { coverObjectKey: true, coverMimeType: true, status: true, accessMode: true },
    });
    if (!checklist?.coverObjectKey) {
      throw new NotFoundException('No cover for this checklist');
    }
    if (!isPrivileged) {
      const visibleFree = checklist.status === 'published' && checklist.accessMode === 'free';
      const assigned = visibleFree
        ? true
        : (await this.prisma.checklistInstance.count({ where: { organizationId, userId, checklistId, deletedAt: null } })) > 0;
      if (!assigned) {
        throw new NotFoundException('No cover for this checklist');
      }
    }

    const expiresIn = 300;
    const url = await this.uploadService.getInlinePresignedUrl(
      checklist.coverObjectKey,
      checklist.coverMimeType ?? 'image/png',
      expiresIn,
    );
    return { url, expiresIn };
  }

  /**
   * PR 362в: a checklist is editable by its creator and by admins always, and by every other author role
   * only while `allowEditByAll` is on. Reading and assigning are not affected. The target may be the
   * checklist itself or one of its items or groups.
   */
  async assertCanEdit(
    target: { checklistId: string } | { itemId: string } | { groupId: string },
    organizationId: string,
    actor: { id: string; roles: readonly string[] },
  ) {
    let checklistId: string | undefined;
    if ('checklistId' in target) checklistId = target.checklistId;
    else if ('itemId' in target) {
      checklistId = (await this.prisma.checklistItem.findFirst({ where: { id: target.itemId, organizationId, deletedAt: null }, select: { checklistId: true } }))?.checklistId;
    } else {
      checklistId = (await this.prisma.checklistItemGroup.findFirst({ where: { id: target.groupId, organizationId }, select: { checklistId: true } }))?.checklistId;
    }
    // A missing target is reported by the operation itself (404).
    if (!checklistId) return;
    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, organizationId, deletedAt: null },
      select: { createdBy: true, allowEditByAll: true },
    });
    if (!checklist) return;
    if (checklist.allowEditByAll || checklist.createdBy === actor.id || actor.roles.includes('admin')) return;
    throw new ForbiddenException('Only the creator or an administrator can edit this checklist');
  }

  /** Switching "everyone may edit" on or off belongs to the creator and admins only. */
  async assertCanChangeEditAccess(checklistId: string, organizationId: string, actor: { id: string; roles: readonly string[] }) {
    const checklist = await this.prisma.checklist.findFirst({ where: { id: checklistId, organizationId, deletedAt: null }, select: { createdBy: true } });
    if (!checklist) return;
    if (checklist.createdBy === actor.id || actor.roles.includes('admin')) return;
    throw new ForbiddenException('Only the creator or an administrator can change who may edit this checklist');
  }

  async createChecklist(input: CreateChecklistInput, createdBy: string) {
    assertFeedbackSettingsConsistent(input.feedbackEnabled ?? true, input.feedbackRequired ?? false);
    const created = await this.prisma.checklist.create({
      data: { ...input, createdBy },
      select: checklistWithItemsSelect,
    });

    await this.auditLog.record({
      organizationId: input.organizationId,
      actorId: createdBy,
      action: 'checklist.created',
      targetType: 'checklist',
      targetId: created.id,
      summary: `Created checklist ${created.title}`,
    });

    return created;
  }

  async updateChecklist(checklistId: string, organizationId: string, input: UpdateChecklistInput, actorId: string | null = null) {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, organizationId, deletedAt: null },
      select: { id: true, scoringMode: true, scaleLevels: true, accessMode: true, status: true, pinned: true, feedbackEnabled: true, feedbackRequired: true },
    });

    if (!checklist) {
      throw new NotFoundException('Checklist not found');
    }

    assertFeedbackSettingsConsistent(input.feedbackEnabled ?? checklist.feedbackEnabled ?? true, input.feedbackRequired ?? checklist.feedbackRequired ?? false);
    const pinned = this.resolvePinned(checklist, input);

    if (input.status === 'published') {
      await this.ensurePublishable(
        checklistId,
        organizationId,
        input.scoringMode ?? checklist.scoringMode,
        input.scaleLevels ?? (checklist.scaleLevels as ScaleLevel[] | null),
      );
    }

    const { scaleLevels, contextFields, moduleSettings, ...rest } = input;
    delete rest.pinned;
    if (moduleSettings?.observers) await assertObserversBelongToOrganization(this.prisma, organizationId, moduleSettings.observers.userIds);

    const updated = await this.updateWithPinLimit(checklistId, organizationId, pinned, {
      ...rest,
      ...(moduleSettings ? overridesToColumns(moduleSettings) : {}),
      ...(pinned !== undefined ? { pinned } : {}),
      ...(scaleLevels !== undefined
        ? { scaleLevels: scaleLevels === null ? Prisma.JsonNull : scaleLevels }
        : {}),
      ...(contextFields !== undefined
        ? { contextFields: contextFields === null ? Prisma.JsonNull : contextFields }
        : {}),
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist.updated',
      targetType: 'checklist',
      targetId: checklistId,
      summary: `Updated checklist ${updated.title}`,
      metadata: { fields: Object.keys(input) },
    });

    return presentStaffChecklist(updated);
  }

  /**
   * PR 354: the pinned value to store, or undefined to leave it alone. Pinning needs a published
   * `free` checklist (400 otherwise); a checklist that stops being free or published is unpinned
   * automatically, and unpinning is always allowed.
   */
  private resolvePinned(
    current: { accessMode: 'assigned' | 'free'; status: 'draft' | 'published' | 'archived'; pinned: boolean },
    input: UpdateChecklistInput,
  ): boolean | undefined {
    const nextMode = input.accessMode ?? current.accessMode;
    const nextStatus = input.status ?? current.status;
    if (nextMode === 'free' && nextStatus === 'published') return input.pinned;
    if (input.pinned === true && !current.pinned) {
      throw new BadRequestException('Only a published free checklist can be pinned');
    }
    return current.pinned ? false : undefined;
  }

  /** Pinning takes a per-organization lock so two parallel requests cannot both pass the limit check. */
  private async updateWithPinLimit(checklistId: string, organizationId: string, pinned: boolean | undefined, data: Prisma.ChecklistUpdateInput) {
    if (pinned !== true) {
      return this.prisma.checklist.update({ where: { id: checklistId, organizationId }, data, select: staffChecklistSelect });
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('checklist-pin'), hashtext(${organizationId}))`;
      const others = await tx.checklist.count({
        where: { organizationId, deletedAt: null, status: 'published', accessMode: 'free', pinned: true, id: { not: checklistId } },
      });
      if (others >= MAX_PINNED_CHECKLISTS) throw new ConflictException(PINNED_LIMIT_MESSAGE);
      return tx.checklist.update({ where: { id: checklistId, organizationId }, data, select: staffChecklistSelect });
    });
  }

  /**
   * PR 327: copies a checklist as a new draft -- settings, groups and (non-deleted) criteria, with
   * criteria re-pointed at the copied groups. Assignments, instances and sessions are never copied,
   * and the copy is always a draft so it can't be assigned before someone has looked at it.
   * One transaction: a copy never exists half-built.
   */
  async copyChecklist(checklistId: string, organizationId: string, actorId: string, keepFreeAccess = true) {
    const source = await this.prisma.checklist.findFirst({
      where: { id: checklistId, organizationId, deletedAt: null },
      include: {
        itemGroups: { orderBy: { order: 'asc' } },
        items: { where: { deletedAt: null }, orderBy: { order: 'asc' } },
      },
    });
    if (!source) {
      throw new NotFoundException('Checklist not found');
    }

    const copyId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.checklist.create({
        data: {
          organizationId,
          title: `${source.title} (копия)`,
          description: source.description,
          status: 'draft',
          scoringMode: source.scoringMode,
          passThreshold: source.passThreshold,
          scaleLevels: source.scaleLevels ?? undefined,
          requiresReview: source.requiresReview,
          contextFields: source.contextFields ?? undefined,
          defaultLocationCapturePolicy: source.defaultLocationCapturePolicy,
          preSessionVisibility: source.preSessionVisibility,
          allowFinishIncomplete: source.allowFinishIncomplete,
          forbidGalleryPhotos: source.forbidGalleryPhotos,
          feedbackEnabled: source.feedbackEnabled,
          feedbackRequired: source.feedbackRequired,
          allowSkipAll: source.allowSkipAll,
          // PR 366: only an administrator's copy of a free checklist stays free.
          accessMode: keepFreeAccess ? source.accessMode : 'assigned',
          allowEditByAll: source.allowEditByAll,
          // PR 395: a copy stays in the folder of the original.
          folderId: source.folderId,
          // PR 397: the copy keeps the module-settings overrides of the original.
          highThresholdOverride: source.highThresholdOverride,
          lowThresholdOverride: source.lowThresholdOverride,
          resultColorLowOverride: source.resultColorLowOverride,
          resultColorMidOverride: source.resultColorMidOverride,
          resultColorHighOverride: source.resultColorHighOverride,
          feedbackVisibilityOverride: source.feedbackVisibilityOverride,
          observerEligibilityOverride: source.observerEligibilityOverride,
          observerRolesOverride: source.observerRolesOverride,
          observerUserIdsOverride: source.observerUserIdsOverride,
          createdBy: actorId,
        },
        select: { id: true },
      });

      const groupIds = new Map<string, string>();
      for (const group of source.itemGroups) {
        const createdGroup = await tx.checklistItemGroup.create({
          data: { organizationId, checklistId: created.id, title: group.title, order: group.order },
          select: { id: true },
        });
        groupIds.set(group.id, createdGroup.id);
      }

      for (const item of source.items) {
        await tx.checklistItem.create({
          data: {
            organizationId,
            checklistId: created.id,
            groupId: item.groupId ? groupIds.get(item.groupId) ?? null : null,
            order: item.order,
            text: item.text,
            points: item.points,
            isRequired: item.isRequired,
            photoRequired: item.photoRequired,
            weight: item.weight,
            allowSkip: item.allowSkip,
            autoSkipUnanswered: item.autoSkipUnanswered,
            scaleId: item.scaleId,
          },
        });
      }
      return created.id;
    });

    // The copy gets its own cover object (best effort: a storage failure must not undo the copy).
    if (source.coverObjectKey && source.coverMimeType) {
      try {
        const coverObjectKey = await this.uploadService.copyChecklistCover(source.coverObjectKey, organizationId, copyId);
        await this.prisma.checklist.update({
          where: { id: copyId },
          data: { coverObjectKey, coverMimeType: source.coverMimeType, coverUpdatedAt: new Date() },
        });
      } catch {
        // the copy simply has no cover
      }
    }

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist.copied',
      targetType: 'checklist',
      targetId: copyId,
      summary: `Copied checklist ${source.title}`,
      metadata: { sourceChecklistId: checklistId },
    });

    return presentStaffChecklist(await this.prisma.checklist.findFirstOrThrow({ where: { id: copyId, organizationId }, select: staffChecklistSelect }));
  }

  /**
   * PR 341: creates a draft from a built-in template (checklist-templates.ts). Same shape as a copy:
   * one transaction, always a draft, nothing shared with other checklists afterwards.
   */
  async createFromTemplate(templateKey: string, locale: string | undefined, organizationId: string, actorId: string) {
    const template = findTemplate(templateKey);
    if (!template) {
      throw new NotFoundException('Checklist template not found');
    }
    const rendered = renderTemplate(template, locale);
    const pointsPerItem = rendered.scoringMode === 'sum_points' ? 10 : 0;

    const checklistId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.checklist.create({
        data: {
          organizationId,
          title: rendered.title,
          description: rendered.description,
          status: 'draft',
          scoringMode: rendered.scoringMode,
          passThreshold: rendered.passThreshold,
          scaleLevels: rendered.scaleLevels ?? undefined,
          contextFields: rendered.contextFields,
          createdBy: actorId,
        },
        select: { id: true },
      });
      let order = 0;
      for (const group of rendered.groups) {
        const createdGroup = await tx.checklistItemGroup.create({
          data: { organizationId, checklistId: created.id, title: group.title, order: group.order },
          select: { id: true },
        });
        for (const entry of group.items) {
          await tx.checklistItem.create({
            data: {
              organizationId,
              checklistId: created.id,
              groupId: createdGroup.id,
              order: order++,
              text: entry.text,
              points: pointsPerItem,
              isRequired: true,
              photoRequired: entry.photoRequired,
            },
          });
        }
      }
      return created.id;
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist.created_from_template',
      targetType: 'checklist',
      targetId: checklistId,
      summary: `Created checklist from template ${template.key}`,
      metadata: { templateKey: template.key, locale: templateLocale(locale) },
    });

    return this.prisma.checklist.findFirstOrThrow({ where: { id: checklistId, organizationId }, select: checklistWithItemsSelect });
  }

  async deleteChecklist(checklistId: string, organizationId: string, actorId: string | null = null) {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!checklist) {
      throw new NotFoundException('Checklist not found');
    }

    const activeInstance = await this.prisma.checklistInstance.findFirst({
      where: { checklistId, status: { in: ['assigned', 'in_progress', 'submitted'] }, deletedAt: null },
      select: { id: true },
    });

    if (activeInstance) {
      throw new BadRequestException('Cannot delete a checklist with an assignment in progress');
    }

    await this.prisma.checklist.update({
      where: { id: checklistId, organizationId },
      data: { deletedAt: new Date() },
    });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'checklist.deleted',
      targetType: 'checklist',
      targetId: checklistId,
      summary: 'Deleted checklist',
    });
  }

  private async ensurePublishable(
    checklistId: string,
    organizationId: string,
    scoringMode: string,
    scaleLevels: ScaleLevel[] | null | undefined,
  ) {
    const items = await this.prisma.checklistItem.findMany({
      where: { checklistId, organizationId, deletedAt: null },
      select: { id: true, scaleId: true },
    });

    if (items.length === 0) {
      throw new BadRequestException('Cannot publish checklist: it has no items');
    }

    if (scoringMode === 'scale' && (!scaleLevels || scaleLevels.length < 2)) {
      throw new BadRequestException('Cannot publish checklist: scale scoring mode requires at least 2 levels');
    }

    // PR 293: a criterion referencing an archived reusable ChecklistScale can never be part of a
    // *new* publication -- an already-published checklist keeps working (its instances snapshot
    // whatever the scale looked like at assignment time regardless of later archival).
    const referencedScaleIds = [...new Set(items.map((item) => item.scaleId).filter((id): id is string => id != null))];
    if (referencedScaleIds.length > 0) {
      const archivedScale = await this.prisma.checklistScale.findFirst({
        where: { id: { in: referencedScaleIds }, organizationId, status: 'archived' },
        select: { id: true, name: true },
      });
      if (archivedScale) {
        throw new BadRequestException(`Cannot publish checklist: a criterion references archived evaluation scale "${archivedScale.name}"`);
      }
    }
  }

  private async assertValidScale(scaleId: string, organizationId: string) {
    const scale = await this.prisma.checklistScale.findFirst({ where: { id: scaleId, organizationId }, select: { id: true } });
    if (!scale) {
      throw new NotFoundException('Evaluation scale not found');
    }
  }

  /** A group can only be assigned to items of the same checklist it belongs to. */
  private async assertValidGroup(groupId: string, checklistId: string, organizationId: string) {
    const group = await this.prisma.checklistItemGroup.findFirst({ where: { id: groupId, checklistId, organizationId }, select: { id: true } });
    if (!group) {
      throw new NotFoundException('Checklist item group not found');
    }
  }

  // ---- Item groups (PR 296 observation-sheet builder) ----

  async listItemGroups(checklistId: string, organizationId: string) {
    await this.getChecklist(checklistId, organizationId);

    return this.prisma.checklistItemGroup.findMany({
      where: { checklistId, organizationId },
      orderBy: { order: 'asc' },
    });
  }

  async createItemGroup(checklistId: string, organizationId: string, input: CreateChecklistItemGroupInput) {
    await this.getChecklist(checklistId, organizationId);
    const count = await this.prisma.checklistItemGroup.count({ where: { checklistId } });

    return this.prisma.checklistItemGroup.create({
      data: { ...input, checklistId, organizationId, order: count },
    });
  }

  async updateItemGroup(groupId: string, organizationId: string, input: UpdateChecklistItemGroupInput) {
    const group = await this.prisma.checklistItemGroup.findFirst({ where: { id: groupId, organizationId }, select: { id: true } });
    if (!group) {
      throw new NotFoundException('Checklist item group not found');
    }

    return this.prisma.checklistItemGroup.update({ where: { id: groupId, organizationId }, data: input });
  }

  /**
   * Duplicates a group and every one of its (non-deleted) items, appended at the end of the same
   * checklist's group/item ordering. Runs in a transaction so a copy can never leave behind a
   * group with no items or items pointing at a group that failed to persist.
   */
  async copyItemGroup(groupId: string, organizationId: string) {
    const group = await this.prisma.checklistItemGroup.findFirst({ where: { id: groupId, organizationId } });
    if (!group) {
      throw new NotFoundException('Checklist item group not found');
    }

    const items = await this.prisma.checklistItem.findMany({
      where: { groupId, organizationId, deletedAt: null },
      orderBy: { order: 'asc' },
    });

    return this.prisma.$transaction(async (tx) => {
      const [groupCount, itemCount] = await Promise.all([
        tx.checklistItemGroup.count({ where: { checklistId: group.checklistId } }),
        tx.checklistItem.count({ where: { checklistId: group.checklistId, deletedAt: null } }),
      ]);

      const newGroup = await tx.checklistItemGroup.create({
        data: { organizationId, checklistId: group.checklistId, title: `${group.title} (копия)`, order: groupCount },
      });

      for (const [index, item] of items.entries()) {
        await tx.checklistItem.create({
          data: {
            organizationId,
            checklistId: item.checklistId,
            groupId: newGroup.id,
            order: itemCount + index,
            text: item.text,
            points: item.points,
            isRequired: item.isRequired,
            photoRequired: item.photoRequired,
            weight: item.weight,
            allowSkip: item.allowSkip,
            autoSkipUnanswered: item.autoSkipUnanswered,
            scaleId: item.scaleId,
          },
        });
      }

      return newGroup;
    });
  }

  // ---- Items ----

  async listItems(checklistId: string, organizationId: string) {
    await this.getChecklist(checklistId, organizationId);

    return this.prisma.checklistItem.findMany({
      where: { checklistId, organizationId, deletedAt: null },
      orderBy: { order: 'asc' },
    });
  }

  async createItem(checklistId: string, organizationId: string, input: CreateChecklistItemInput, locale?: string | null) {
    await this.getChecklist(checklistId, organizationId);
    const scaleId = input.scaleId === undefined ? await this.scaleService.ensureDefaultScale(organizationId, locale) : input.scaleId;
    if (scaleId) {
      await this.assertValidScale(scaleId, organizationId);
    }
    if (input.groupId) {
      await this.assertValidGroup(input.groupId, checklistId, organizationId);
    }
    const count = await this.prisma.checklistItem.count({ where: { checklistId, deletedAt: null } });

    return this.prisma.checklistItem.create({
      data: { ...input, scaleId, checklistId, organizationId, order: count },
    });
  }

  async updateItem(itemId: string, organizationId: string, input: UpdateChecklistItemInput) {
    const item = await this.prisma.checklistItem.findFirst({
      where: { id: itemId, organizationId, deletedAt: null },
      select: { id: true, checklistId: true, allowSkip: true, autoSkipUnanswered: true },
    });

    if (!item) {
      throw new NotFoundException('Checklist item not found');
    }

    const allowSkip = input.allowSkip ?? item.allowSkip;
    const autoSkipUnanswered = input.autoSkipUnanswered ?? item.autoSkipUnanswered;
    if (autoSkipUnanswered && !allowSkip) {
      throw new BadRequestException('autoSkipUnanswered requires allowSkip to also be true');
    }

    if (input.scaleId) {
      await this.assertValidScale(input.scaleId, organizationId);
    }

    if (input.groupId) {
      await this.assertValidGroup(input.groupId, item.checklistId, organizationId);
    }

    return this.prisma.checklistItem.update({ where: { id: itemId, organizationId }, data: input });
  }

  async deleteItem(itemId: string, organizationId: string) {
    const item = await this.prisma.checklistItem.findFirst({
      where: { id: itemId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!item) {
      throw new NotFoundException('Checklist item not found');
    }

    await this.prisma.checklistItem.update({ where: { id: itemId, organizationId }, data: { deletedAt: new Date() } });
  }

  // ---- Instances (assignment + taking) ----

  /**
   * `db` lets a caller (e.g. ChecklistSessionService.repeat/bulkCreate) run this inside its own
   * outer transaction, so the new ChecklistInstance and its paired ChecklistSession commit or
   * roll back together -- never an orphaned active assignment left behind by a session-creation
   * failure. Defaults to `this.prisma` (its own transaction below) for the standalone caller.
   */
  async assignChecklist(
    checklistId: string,
    organizationId: string,
    input: AssignChecklistInput,
    assignedBy: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const checklist = await db.checklist.findFirst({
      where: { id: checklistId, organizationId, deletedAt: null },
      select: checklistWithGroupsSelect,
    });

    if (!checklist) {
      throw new NotFoundException('Checklist not found');
    }

    if (checklist.status !== 'published') {
      throw new BadRequestException('Cannot assign a checklist that is not published');
    }

    const user = await db.user.findFirst({
      where: { id: input.userId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const activeInstance = await db.checklistInstance.findFirst({
      where: { checklistId, userId: input.userId, status: { in: ['assigned', 'in_progress', 'submitted'] }, deletedAt: null },
      select: { id: true },
    });

    if (activeInstance) {
      throw new BadRequestException(ACTIVE_ASSIGNMENT_CONFLICT_MESSAGE);
    }

    const items = await db.checklistItem.findMany({
      where: { checklistId, organizationId, deletedAt: null },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        checklistId: true,
        order: true,
        text: true,
        points: true,
        isRequired: true,
        photoRequired: true,
        weight: true,
        allowSkip: true,
        autoSkipUnanswered: true,
        scaleId: true,
        groupId: true,
      },
    });
    const itemsWithScale = await this.attachItemScales(db, organizationId, items);
    const runtimeChecklist = this.toRuntimeChecklist(checklist, itemsWithScale);
    const snapshot = this.buildTemplateSnapshot(runtimeChecklist);

    const createInstance = async (transaction: Prisma.TransactionClient | PrismaService) => {
      if (input.reviewerId) await this.assertValidReviewer(transaction, input.reviewerId, organizationId);
      const instance = await transaction.checklistInstance.create({ data: {
        organizationId,
        checklistId,
        userId: input.userId,
        assignedBy,
        maxScore: this.computeMaxScore(runtimeChecklist.items, runtimeChecklist),
        templateSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        snapshotVersion: CHECKLIST_SNAPSHOT_VERSION,
        dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
        reviewerId: input.reviewerId, reviewAssignedAt: input.reviewerId ? new Date() : undefined,
        reviewAssignedBy: input.reviewerId ? assignedBy : undefined,
      },
      select: instanceSelect,
      });
      await transaction.checklistInstanceEvent.create({ data: {
        organizationId, instanceId: instance.id, eventType: 'assigned', actorUserId: assignedBy,
        metadata: input.reviewerId ? { reviewerId: input.reviewerId } : undefined,
      }});
      return instance;
    };
    // Already inside a caller-managed transaction (`db` is a TransactionClient) -- run in place
    // rather than nesting a second transaction, which Prisma does not support.
    const instance = db === this.prisma ? await this.prisma.$transaction((tx) => createInstance(tx)) : await createInstance(db);

    // AuditLogService writes through the root Prisma client, not `db` -- it can't participate in
    // a caller-managed transaction. Recording here unconditionally would log a "checklist_instance
    // assigned" entry that survives even if the caller's outer transaction later rolls back this
    // very instance (e.g. repeatSession/bulkCreate failing at the session-creation step). Only
    // audit when this call ran (and already committed) its own transaction; a caller running us
    // inside its own transaction is responsible for its own post-commit audit entry.
    if (db === this.prisma) {
      await this.auditLog.record({
        organizationId,
        actorId: assignedBy,
        action: 'checklist_instance.assigned',
        targetType: 'checklist_instance',
        targetId: instance.id,
        summary: `Assigned checklist ${checklist.title} to user`,
        metadata: { checklistId, userId: input.userId },
      });
    }

    return instance;
  }

  async bulkAssignChecklist(
    checklistId: string,
    organizationId: string,
    input: BulkAssignChecklistInput,
    assignedBy: string,
    actorRoles: string[],
  ) {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, organizationId, deletedAt: null },
      select: checklistWithGroupsSelect,
    });
    if (!checklist) throw new NotFoundException('Checklist not found');
    if (checklist.status !== 'published') {
      throw new BadRequestException('Cannot assign a checklist that is not published');
    }

    const userTargetIds = input.targets.filter((target) => target.type === 'user').map((target) => target.id);
    const groupTargetIds = input.targets.filter((target) => target.type === 'group').map((target) => target.id);
    const includeManagerTeam = input.targets.some((target) => target.type === 'manager_team');
    const managerScoped = actorRoles.includes('manager') && !actorRoles.some((role) => role === 'admin' || role === 'instructor');

    const managedGroups = await this.prisma.managerGroup.findMany({
      where: { organizationId, managerId: assignedBy, deletedAt: null },
      select: { groupId: true },
    });
    const managedGroupIds = managedGroups.map(({ groupId }) => groupId);
    if (managerScoped && groupTargetIds.some((id) => !managedGroupIds.includes(id))) {
      throw new ForbiddenException('You can only assign checklists to groups you manage');
    }

    const requestedGroupIds = [...new Set([...groupTargetIds, ...(includeManagerTeam ? managedGroupIds : [])])];
    const groups = requestedGroupIds.length === 0 ? [] : await this.prisma.group.findMany({
      where: { id: { in: requestedGroupIds }, organizationId, status: 'active', deletedAt: null },
      select: { id: true },
    });
    if (groups.length !== requestedGroupIds.length) {
      throw new BadRequestException('One or more target groups are invalid');
    }

    const membershipGroupIds = [...new Set([...requestedGroupIds, ...(managerScoped ? managedGroupIds : [])])];
    const memberships = membershipGroupIds.length === 0 ? [] : await this.prisma.groupMember.findMany({
      where: { organizationId, groupId: { in: membershipGroupIds }, deletedAt: null },
      select: { userId: true, groupId: true },
    });
    const recipientIds = new Set(userTargetIds);
    memberships.filter(({ groupId }) => requestedGroupIds.includes(groupId)).forEach(({ userId }) => recipientIds.add(userId));
    if (recipientIds.size === 0) throw new BadRequestException('Bulk assignment resolved to no recipients');
    if (recipientIds.size > MAX_BULK_CHECKLIST_RECIPIENTS) {
      throw new BadRequestException(`Bulk assignment is limited to ${MAX_BULK_CHECKLIST_RECIPIENTS} recipients`);
    }

    const orderedRecipientIds = [...recipientIds].sort();
    const users = orderedRecipientIds.length === 0 ? [] : await this.prisma.user.findMany({
      where: { id: { in: orderedRecipientIds }, organizationId, status: 'active', deletedAt: null },
      select: { id: true },
    });
    if (users.length !== orderedRecipientIds.length) {
      throw new BadRequestException('One or more target users are invalid');
    }
    if (managerScoped) {
      const managedMemberIds = new Set(memberships.filter(({ groupId }) => managedGroupIds.includes(groupId)).map(({ userId }) => userId));
      if (orderedRecipientIds.some((id) => !managedMemberIds.has(id))) {
        throw new ForbiddenException('You can only assign checklists to users in groups you manage');
      }
    }

    const items = await this.prisma.checklistItem.findMany({
      where: { checklistId, organizationId, deletedAt: null }, orderBy: { order: 'asc' },
      select: { id: true, checklistId: true, order: true, text: true, points: true, isRequired: true, photoRequired: true, weight: true, allowSkip: true, autoSkipUnanswered: true, scaleId: true, groupId: true },
    });
    const itemsWithScale = await this.attachItemScales(this.prisma, organizationId, items);
    const runtimeChecklist = this.toRuntimeChecklist(checklist, itemsWithScale);
    const snapshot = this.buildTemplateSnapshot(runtimeChecklist) as unknown as Prisma.InputJsonValue;
    const dueAt = input.dueAt ? new Date(input.dueAt) : undefined;

    return this.prisma.$transaction(async (transaction) => {
      const active = orderedRecipientIds.length === 0 ? [] : await transaction.checklistInstance.findMany({
        where: { checklistId, organizationId, userId: { in: orderedRecipientIds }, status: { in: ['assigned', 'in_progress', 'submitted'] }, deletedAt: null },
        select: { userId: true },
      });
      const activeIds = new Set(active.map(({ userId }) => userId));
      const createFor = orderedRecipientIds.filter((id) => !activeIds.has(id));
      if (createFor.length > 0) {
        await transaction.checklistInstance.createMany({ data: createFor.map((userId) => ({
          organizationId, checklistId, userId, assignedBy,
          maxScore: this.computeMaxScore(runtimeChecklist.items, runtimeChecklist),
          templateSnapshot: snapshot, snapshotVersion: CHECKLIST_SNAPSHOT_VERSION, dueAt,
        })) });
      }
      return { created: createFor.length, skippedActive: activeIds.size, resolvedRecipients: orderedRecipientIds.length, recipientCount: orderedRecipientIds.length };
    });
  }

  async listMyInstances(userId: string, organizationId: string) {
    return this.listInstancesWithDeadlineRefresh({ userId, organizationId });
  }

  /**
   * PR 353: catalog of published `free` checklists of the organization for any signed-in user.
   * Returns only what the catalog card needs (title, description, criteria count) -- never the
   * criteria themselves, which stay behind the per-checklist pre-session visibility rules --
   * plus the caller's own unfinished instance so the UI can offer "continue" instead of "start".
   */
  async listFreeChecklists(organizationId: string, userId: string) {
    const checklists = await this.prisma.checklist.findMany({
      where: { organizationId, deletedAt: null, status: 'published', accessMode: 'free' },
      orderBy: [{ pinned: 'desc' }, { title: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        description: true,
        pinned: true,
        coverUpdatedAt: true,
        _count: { select: { items: { where: { deletedAt: null } } } },
      },
    });
    const active = checklists.length === 0
      ? []
      : await this.prisma.checklistInstance.findMany({
          where: {
            organizationId,
            userId,
            deletedAt: null,
            status: { in: [...ACTIVE_INSTANCE_STATUSES] },
            checklistId: { in: checklists.map((checklist) => checklist.id) },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, checklistId: true, status: true },
        });
    const activeByChecklist = new Map<string, { id: string; status: string }>();
    for (const instance of active) {
      if (!activeByChecklist.has(instance.checklistId)) activeByChecklist.set(instance.checklistId, instance);
    }
    return checklists.map((checklist) => ({
      id: checklist.id,
      title: checklist.title,
      description: checklist.description,
      pinned: checklist.pinned,
      coverUpdatedAt: checklist.coverUpdatedAt,
      itemCount: checklist._count.items,
      activeInstanceId: activeByChecklist.get(checklist.id)?.id ?? null,
      activeInstanceStatus: activeByChecklist.get(checklist.id)?.status ?? null,
    }));
  }

  /**
   * PR 353: a user starts a published `free` checklist for themselves. The subject is always the
   * caller (never taken from a request body). A second start while an unfinished instance exists
   * returns that instance instead of failing or creating a duplicate; a per-(checklist, user)
   * advisory lock serialises concurrent starts so two parallel requests cannot both pass the
   * "no active instance" check. Any other mode, status, tenant or deleted checklist is a 404.
   */
  async startFreeChecklist(checklistId: string, organizationId: string, userId: string) {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, organizationId, deletedAt: null, status: 'published', accessMode: 'free' },
      select: { id: true, title: true },
    });
    if (!checklist) {
      throw new NotFoundException('Checklist not found');
    }

    const { instance, created } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${checklistId}), hashtext(${userId}))`;
      const existing = await tx.checklistInstance.findFirst({
        where: { checklistId, organizationId, userId, status: { in: [...ACTIVE_INSTANCE_STATUSES] }, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: instanceSelect,
      });
      if (existing) return { instance: existing, created: false };
      return { instance: await this.assignChecklist(checklistId, organizationId, { userId }, userId, tx), created: true };
    });

    if (created) {
      await this.auditLog.record({
        organizationId,
        actorId: userId,
        action: 'checklist_instance.started_free',
        targetType: 'checklist_instance',
        targetId: instance.id,
        summary: `Started free checklist ${checklist.title}`,
        metadata: { checklistId, userId },
      });
    }
    return instance;
  }

  async listInstancesForChecklist(checklistId: string, organizationId: string) {
    return this.listInstancesWithDeadlineRefresh({ checklistId, organizationId });
  }

  async listPendingReview(organizationId: string, userScope: object = {}) {
    const instances = await this.prisma.checklistInstance.findMany({
      where: { organizationId, status: 'submitted', deletedAt: null, ...userScope },
      orderBy: { submittedAt: 'asc' },
      select: instanceWithSnapshotSelect,
    });

    return instances.map((instance) => this.presentInstance(instance));
  }

  async searchReviewQueue(organizationId: string, reviewerId: string, query: ChecklistQueueQuery, userScope: object = {}) {
    const where: Prisma.ChecklistInstanceWhereInput = {
      organizationId, deletedAt: null, ...userScope,
      ...(query.assignment === 'mine' ? { reviewerId } : query.assignment === 'unassigned' ? { reviewerId: null } : {}),
      ...(query.checklistId ? { checklistId: query.checklistId } : {}),
      ...(query.learnerId ? { userId: query.learnerId } : {}),
      ...(query.status ? { status: query.status } : { status: 'submitted' }),
      ...(query.passed ? { passed: query.passed === 'true' } : {}),
      ...((query.from || query.to) ? { submittedAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.checklistInstance.findMany({ where, orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: instanceWithSnapshotSelect }),
      this.prisma.checklistInstance.count({ where }),
    ]);
    return { items: items.map((item) => this.presentInstance(item)), page: query.page, pageSize: query.pageSize, total };
  }

  async assignReviewer(instanceId: string, organizationId: string, reviewerId: string | null, actorUserId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const instance = await transaction.checklistInstance.findFirst({ where: { id: instanceId, organizationId, deletedAt: null }, select: { id: true, status: true } });
      if (!instance) throw new NotFoundException('Checklist assignment not found');
      if (reviewerId) await this.assertValidReviewer(transaction, reviewerId, organizationId);
      const updated = await transaction.checklistInstance.update({ where: { id: instanceId }, data: { reviewerId, reviewAssignedAt: reviewerId ? new Date() : null, reviewAssignedBy: reviewerId ? actorUserId : null }, select: instanceSelect });
      await transaction.checklistInstanceEvent.create({ data: { organizationId, instanceId, eventType: 'reviewer_assigned', actorUserId, metadata: { reviewerId } } });
      return updated;
    });
  }

  async listEvents(instanceId: string, organizationId: string) {
    const exists = await this.prisma.checklistInstance.findFirst({ where: { id: instanceId, organizationId, deletedAt: null }, select: { id: true } });
    if (!exists) throw new NotFoundException('Checklist assignment not found');
    return this.prisma.checklistInstanceEvent.findMany({ where: { instanceId, organizationId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  }

  async getAnalytics(organizationId: string, query: ChecklistAnalyticsQuery, userScope: object = {}) {
    const where: Prisma.ChecklistInstanceWhereInput = { organizationId, deletedAt: null, ...userScope, ...(query.checklistId ? { checklistId: query.checklistId } : {}), ...((query.from || query.to) ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}) };
    const rows = await this.prisma.checklistInstance.findMany({ where, select: { status: true, passed: true, percentage: true, createdAt: true, submittedAt: true, completedAt: true } });
    const counts = Object.fromEntries(['assigned', 'in_progress', 'submitted', 'completed', 'expired'].map((status) => [status, rows.filter((row) => row.status === status).length]));
    const completed = rows.filter((row) => row.status === 'completed');
    const reviewed = completed.filter((row) => row.submittedAt && row.completedAt);
    const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    return { assignmentsTotal: rows.length, counts, completionRate: rows.length ? completed.length / rows.length : 0, passRate: completed.length ? completed.filter((row) => row.passed).length / completed.length : 0, averagePercentage: average(completed.map((row) => row.percentage)), expiredRate: rows.length ? counts.expired / rows.length : 0, pendingReview: counts.submitted, averageCompletionTimeMs: average(completed.filter((row) => row.completedAt).map((row) => row.completedAt!.getTime() - row.createdAt.getTime())), averageReviewTimeMs: average(reviewed.map((row) => row.completedAt!.getTime() - row.submittedAt!.getTime())) };
  }

  /**
   * PR 299 — manager checklist analytics: employee-first aggregation over `ChecklistSession`
   * (the workplace-training overlay, not every async `ChecklistInstance`) for the `/manager/checklists`
   * dashboard. `userScope` comes from `ChecklistReviewAccessService.participantLearnerScope()` --
   * `{}` for admin, the unified `OrganizationAccessScopeService.user()` filter for a manager.
   *
   * `lowThreshold` is deliberately nullable (DEC-CHKS-001, docs/status/OPEN_DECISIONS.md defers a
   * concrete value) -- when unset we bucket by the instance's own `passed` flag instead of
   * inventing a percentage cutoff no one configured.
   */
  async getManagerAnalytics(
    organizationId: string,
    query: ChecklistManagerAnalyticsQuery,
    userScope: Prisma.UserWhereInput,
    orgThresholds: { high: number; low: number | null },
  ) {
    // PR 397: sheets with their own thresholds colour their results by those; a view of a single sheet uses them throughout.
    // Averages across several sheets are compared by percentage and banded by the organization's thresholds.
    const sheetThresholds = new Map((await this.prisma.checklist.findMany({
      where: { organizationId, highThresholdOverride: { not: null }, lowThresholdOverride: { not: null } },
      select: { id: true, highThresholdOverride: true, lowThresholdOverride: true },
    })).map((row) => [row.id, { high: row.highThresholdOverride!, low: row.lowThresholdOverride! }] as const));
    const thresholds = (query.checklistId ? sheetThresholds.get(query.checklistId) : undefined) ?? orgThresholds;
    const from = new Date(query.from);
    const to = new Date(query.to);
    const previousFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));

    // Departments are derived from the already scoped employees (participantLearnerScope), so a manager
    // only ever sees departments of their own zone and never gains admin-level org structure access.
    const scopedEmployees = await this.prisma.user.findMany({
      where: { organizationId, deletedAt: null, ...userScope },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        departmentMemberships: {
          where: { organizationId, isPrimary: true, effectiveTo: null },
          select: { department: { select: {
            id: true, name: true,
            managers: {
              where: { organizationId, type: { in: ['DIRECT', 'FUNCTIONAL'] }, isPrimary: true, effectiveTo: null, user: { organizationId, deletedAt: null } },
              select: { user: { select: { id: true, firstName: true, lastName: true } } },
              orderBy: [{ type: 'asc' }, { id: 'asc' }],
              take: 2,
            },
          } } },
          take: 1,
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    const departmentOf = (employee: (typeof scopedEmployees)[number]) => employee.departmentMemberships[0]?.department ?? null;
    const managersOf = (employee: (typeof scopedEmployees)[number]) => [...new Map(
      (departmentOf(employee)?.managers ?? []).map(({ user }) => [user.id, { id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || '—' }] as const),
    ).values()];
    const managerOptions = [...new Map(scopedEmployees.flatMap((employee) => managersOf(employee).map((manager) => [manager.id, manager] as const))).values()]
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const managerEmployees = query.managerId ? scopedEmployees.filter((employee) =>
      query.managerId === 'unassigned' ? managersOf(employee).length === 0 : managersOf(employee).some((manager) => manager.id === query.managerId),
    ) : scopedEmployees;
    const employees = query.departmentId ? managerEmployees.filter((employee) => departmentOf(employee)?.id === query.departmentId) : managerEmployees;
    const managerByEmployee = new Map(employees.map((employee) => [employee.id,
      managersOf(employee).filter((manager) => !query.managerId || manager.id === query.managerId),
    ] as const));
    const departmentOptions = [...new Map(scopedEmployees.flatMap((employee) => { const department = departmentOf(employee); return department ? [[department.id, department.name] as const] : []; })).entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const scopedIds = scopedEmployees.map((employee) => employee.id);
    const visibleIds = new Set(employees.map((employee) => employee.id));
    const emptyResult = {
      summary: { totalEmployees: 0, totalSessions: 0, completedSessions: 0, selfCompletedCount: 0, averagePercentage: 0, lowCount: 0, highCount: 0, noCompletionCount: 0 },
      thresholds,
      distribution: [{ bucket: 'low', count: 0 }, { bucket: 'mid', count: 0 }, { bucket: 'high', count: 0 }],
      trend: [] as { date: string; averagePercentage: number; count: number }[],
      employees: [] as ManagerAnalyticsEmployeeRow[],
      departments: [] as ManagerAnalyticsDepartmentRow[],
      departmentOptions,
      managerOptions,
      managers: [] as ManagerAnalyticsManagerRow[],
    };
    if (scopedIds.length === 0) return emptyResult;

    const instanceSelect = { userId: true, checklistId: true, status: true, percentage: true, passed: true, scored: true } as const;
    const sessionSelect = { status: true, scheduledAt: true, instance: { select: instanceSelect } } as const;
    const sessionWhere = (range: { gte: Date; lte: Date }): Prisma.ChecklistSessionWhereInput => ({
      organizationId,
      deletedAt: null,
      scheduledAt: range,
      instance: { deletedAt: null, userId: { in: scopedIds }, ...(query.checklistId ? { checklistId: query.checklistId } : {}) },
    });
    // PR 380: results the employee finished on their own (free access, or assigned without an observation
    // session) count next to sessions; they are dated by completion and flagged `self` so "sessions" stay sessions.
    const selfWhere = (range: { gte: Date; lte: Date }): Prisma.ChecklistInstanceWhereInput => ({
      organizationId,
      deletedAt: null,
      session: { is: null },
      status: 'completed',
      completedAt: range,
      userId: { in: scopedIds },
      ...(query.checklistId ? { checklistId: query.checklistId } : {}),
    });
    const asSessions = async (range: { gte: Date; lte: Date }): Promise<AnalyticsRow[]> => {
      const [sessions, selfDone] = await Promise.all([
        this.prisma.checklistSession.findMany({ where: sessionWhere(range), select: sessionSelect }),
        this.prisma.checklistInstance.findMany({ where: selfWhere(range), select: { ...instanceSelect, completedAt: true } }),
      ]);
      return [
        ...sessions.map((session) => ({ ...session, self: false })),
        ...selfDone.map(({ completedAt, ...instance }) => ({ status: 'completed', scheduledAt: completedAt, self: true, instance })),
      ];
    };
    const [allCurrentSessions, allPreviousSessions] = await Promise.all([asSessions({ gte: from, lte: to }), asSessions({ gte: previousFrom, lte: from })]);
    const currentSessions = allCurrentSessions.filter((session) => visibleIds.has(session.instance.userId));
    const previousSessions = allPreviousSessions.filter((session) => visibleIds.has(session.instance.userId));
    if (employees.length === 0) return { ...emptyResult, departments: this.departmentBreakdown(managerEmployees, allCurrentSessions) };

    const bucketOf = (percentage: number, passed: boolean, checklistId: string): 'low' | 'mid' | 'high' => {
      const own = sheetThresholds.get(checklistId) ?? thresholds;
      if (own.low === null && percentage < own.high) return passed ? 'mid' : 'low';
      return performanceBand(percentage, own);
    };
    const average = (values: number[]) => (values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null);

    const scoredCompleted = currentSessions.filter((session) => session.instance.status === 'completed' && session.instance.scored);
    const distributionCounts = { low: 0, mid: 0, high: 0 };
    for (const session of scoredCompleted) distributionCounts[bucketOf(session.instance.percentage, session.instance.passed, session.instance.checklistId)] += 1;

    const byDay = new Map<string, { total: number; count: number }>();
    for (const session of scoredCompleted) {
      const day = session.scheduledAt!.toISOString().slice(0, 10);
      const bucket = byDay.get(day) ?? { total: 0, count: 0 };
      bucket.total += session.instance.percentage;
      bucket.count += 1;
      byDay.set(day, bucket);
    }
    const trend = [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, bucket]) => ({ date, averagePercentage: Math.round(bucket.total / bucket.count), count: bucket.count }));

    const byEmployee = (sessions: typeof currentSessions) => {
      const map = new Map<string, { sessionsCount: number; completed: { percentage: number }[]; lastSessionAt: Date | null }>();
      for (const session of sessions) {
        const userId = session.instance.userId;
        const entry = map.get(userId) ?? { sessionsCount: 0, completed: [], lastSessionAt: null };
        if (!session.self) entry.sessionsCount += 1;
        if (session.instance.status === 'completed' && session.instance.scored) entry.completed.push({ percentage: session.instance.percentage });
        if (session.scheduledAt && (!entry.lastSessionAt || session.scheduledAt > entry.lastSessionAt)) entry.lastSessionAt = session.scheduledAt;
        map.set(userId, entry);
      }
      return map;
    };
    const currentByEmployee = byEmployee(currentSessions);
    const previousByEmployee = byEmployee(previousSessions);

    const employeeRows: ManagerAnalyticsEmployeeRow[] = employees.map((employee) => {
      const current = currentByEmployee.get(employee.id);
      const previousAverage = average((previousByEmployee.get(employee.id)?.completed ?? []).map((row) => row.percentage));
      const currentAverage = average((current?.completed ?? []).map((row) => row.percentage));
      const trendDirection =
        currentAverage === null || previousAverage === null ? null : currentAverage === previousAverage ? 'flat' : currentAverage > previousAverage ? 'up' : 'down';
      return {
        userId: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        department: departmentOf(employee)?.name ?? null,
        departmentId: departmentOf(employee)?.id ?? null,
        sessionsCount: current?.sessionsCount ?? 0,
        completedCount: current?.completed.length ?? 0,
        averagePercentage: currentAverage,
        trend: trendDirection,
        performance: currentAverage === null ? null : performanceBand(currentAverage, thresholds),
        lastSessionAt: current?.lastSessionAt?.toISOString() ?? null,
      };
    });

    return {
      summary: {
        totalEmployees: employees.length,
        totalSessions: currentSessions.filter((session) => !session.self).length,
        completedSessions: currentSessions.filter((session) => !session.self && session.instance.status === 'completed').length,
        selfCompletedCount: currentSessions.filter((session) => session.self).length,
        averagePercentage: average(scoredCompleted.map((session) => session.instance.percentage)) ?? 0,
        lowCount: distributionCounts.low,
        highCount: distributionCounts.high,
        noCompletionCount: employeeRows.filter((row) => row.completedCount === 0).length,
      },
      thresholds,
      distribution: [
        { bucket: 'low' as const, count: distributionCounts.low },
        { bucket: 'mid' as const, count: distributionCounts.mid },
        { bucket: 'high' as const, count: distributionCounts.high },
      ],
      trend,
      employees: employeeRows,
      departments: this.departmentBreakdown(managerEmployees, allCurrentSessions),
      departmentOptions,
      managerOptions,
      managers: this.managerBreakdown(managerByEmployee, currentSessions),
    };
  }

  /** Both primary manager types; deduplicated by user so one person in both roles counts once. */
  private managerBreakdown(
    managerByEmployee: Map<string, { id: string; name: string }[]>,
    sessions: { status: string; self?: boolean; instance: { userId: string; status: string; percentage: number; scored: boolean } }[],
  ): ManagerAnalyticsManagerRow[] {
    const rows = new Map<string | null, ManagerAnalyticsManagerRow & { total: number; scoredCount: number }>();
    for (const managers of managerByEmployee.values()) {
      for (const manager of managers.length ? managers : [null]) {
        const id = manager?.id ?? null;
        const row = rows.get(id) ?? { managerId: id, name: manager?.name ?? null, employeesCount: 0, completedCount: 0, averagePercentage: null, total: 0, scoredCount: 0 };
        row.employeesCount++;
        rows.set(id, row);
      }
    }
    for (const session of sessions) {
      const managers = managerByEmployee.get(session.instance.userId);
      if (session.status !== 'completed' || !managers) continue;
      for (const manager of managers.length ? managers : [null]) {
        const row = rows.get(manager?.id ?? null)!;
        row.completedCount++;
        if (session.instance.status === 'completed' && session.instance.scored) {
          row.total += session.instance.percentage;
          row.scoredCount++;
        }
      }
    }
    return [...rows.values()].map(({ total, scoredCount, ...row }) => ({
      ...row, averagePercentage: scoredCount ? Math.round(total / scoredCount) : null,
    })).sort((a, b) => a.managerId === b.managerId ? 0 : a.managerId === null ? 1 : b.managerId === null ? -1 :
      a.name!.localeCompare(b.name!) || a.managerId.localeCompare(b.managerId));
  }

  /** Per-department roll-up over the whole scoped zone (independent of the selected department filter). */
  private departmentBreakdown(
    scopedEmployees: { id: string; departmentMemberships: { department: { id: string; name: string } }[] }[],
    sessions: { self?: boolean; instance: { userId: string; status: string; percentage: number; scored: boolean } }[],
  ): ManagerAnalyticsDepartmentRow[] {
    const rows = new Map<string, { name: string; employees: Set<string>; sessionsCount: number; completed: number[]; completedEmployees: Set<string> }>();
    const departmentByUser = new Map<string, { id: string; name: string }>();
    for (const employee of scopedEmployees) {
      const department = employee.departmentMemberships[0]?.department;
      if (!department) continue;
      departmentByUser.set(employee.id, department);
      const row = rows.get(department.id) ?? { name: department.name, employees: new Set<string>(), sessionsCount: 0, completed: [], completedEmployees: new Set<string>() };
      row.employees.add(employee.id);
      rows.set(department.id, row);
    }
    for (const session of sessions) {
      const department = departmentByUser.get(session.instance.userId);
      const row = department ? rows.get(department.id) : undefined;
      if (!row) continue;
      if (!session.self) row.sessionsCount += 1;
      if (session.instance.status === 'completed' && session.instance.scored) {
        row.completed.push(session.instance.percentage);
        row.completedEmployees.add(session.instance.userId);
      }
    }
    return [...rows.entries()]
      .map(([departmentId, row]) => ({
        departmentId,
        name: row.name,
        employeesCount: row.employees.size,
        sessionsCount: row.sessionsCount,
        completedCount: row.completed.length,
        averagePercentage: row.completed.length ? Math.round(row.completed.reduce((sum, value) => sum + value, 0) / row.completed.length) : null,
        noCompletionCount: row.employees.size - row.completedEmployees.size,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * PR 336: CSV of the dashboard's employees table. Runs through getManagerAnalytics() so the scope
   * (participantLearnerScope) and period/checklist/department filters are the dashboard's own, then
   * applies the same search / toggle / sort the page applies. Audited with filters and row count.
   */
  async exportManagerAnalytics(
    organizationId: string,
    query: ChecklistManagerAnalyticsExportQuery,
    userScope: Prisma.UserWhereInput,
    thresholds: { high: number; low: number | null },
    actor: { id: string; locale: string | null },
  ) {
    const { table: tableKind = 'employees', q, noCompletion, performance, sort, dir, format = 'csv', ...analyticsQuery } = query;
    const analytics = await this.getManagerAnalytics(organizationId, analyticsQuery, userScope, thresholds);
    const employeeRows = tableKind === 'employees' ? viewEmployees(analytics.employees, { q, noCompletion, performance, sort, dir }) : [];
    const rowCount = tableKind === 'managers' ? analytics.managers.length : employeeRows.length;
    if (rowCount > MAX_EXPORT_ROWS) {
      throw new BadRequestException(`The export is limited to ${MAX_EXPORT_ROWS} ${tableKind}. Narrow the filters.`);
    }
    const table = tableKind === 'managers' ? managerExportRows(analytics.managers, exportLocale(actor.locale)) : employeeExportRows(employeeRows, exportLocale(actor.locale));
    await this.auditLog.record({
      organizationId,
      actorId: actor.id,
      action: 'checklist_report.exported',
      targetType: 'checklist_report',
      summary: `Exported ${rowCount} ${tableKind} of the checklist dashboard to ${format.toUpperCase()}`,
      metadata: { kind: tableKind === 'managers' ? 'manager_managers' : 'manager_employees', format, rowCount, filters: performance && tableKind === 'employees' ? { ...analyticsQuery, performance } : analyticsQuery },
    });
    return { filename: `checklist-${tableKind}-${new Date().toISOString().slice(0, 10)}.csv`, csv: serializeReportCsv(table), rows: table, rowCount };
  }

  private async assertValidReviewer(transaction: Prisma.TransactionClient, reviewerId: string, organizationId: string) {
    const reviewer = await transaction.user.findFirst({ where: { id: reviewerId, organizationId, deletedAt: null, memberships: { some: { role: { in: ['admin', 'manager', 'instructor', 'mentor'] }, organizationId } } }, select: { id: true } });
    if (!reviewer) throw new BadRequestException('Reviewer is not eligible to review checklists');
  }

  private async recordMutationEvents(
    organizationId: string,
    instanceId: string,
    actorUserId: string,
    itemId: string,
    eventType: 'item_answered' | 'photo_attached' | 'item_approved' | 'item_rejected',
    previousStatus: string,
    nextStatus: string,
  ) {
    const events: Prisma.ChecklistInstanceEventCreateManyInput[] = [
      { organizationId, instanceId, actorUserId, itemId, eventType },
    ];
    if (previousStatus === 'assigned' && nextStatus !== 'assigned') {
      events.push({ organizationId, instanceId, actorUserId, eventType: 'started' });
    }
    if (previousStatus !== 'submitted' && nextStatus === 'submitted') {
      events.push({ organizationId, instanceId, actorUserId, eventType: 'submitted' });
    }
    if (previousStatus !== 'completed' && nextStatus === 'completed') {
      events.push({ organizationId, instanceId, actorUserId, eventType: 'completed' });
    }
    await this.prisma.checklistInstanceEvent.createMany({ data: events });
  }

  async getInstance(instanceId: string, organizationId: string) {
    let instance = await this.prisma.checklistInstance.findFirst({
      where: { id: instanceId, organizationId, deletedAt: null },
      select: instanceWithSnapshotSelect,
    });

    if (!instance) {
      throw new NotFoundException('Checklist assignment not found');
    }

    if (this.shouldExpire(instance.status, instance.dueAt, new Date())) {
      await expireDueChecklistInstances(this.prisma, { id: instanceId, organizationId }, new Date());
      instance = await this.prisma.checklistInstance.findFirst({
        where: { id: instanceId, organizationId, deletedAt: null },
        select: instanceWithSnapshotSelect,
      });
      if (!instance) throw new NotFoundException('Checklist assignment not found');
    }

    return this.presentInstance(instance);
  }

  /**
   * PR 300: pure score computation from persisted `ChecklistItemResult` rows + the immutable
   * template snapshot -- no writes, no status-transition side effects (unlike `recomputeInstance`,
   * which also derives/writes `ChecklistInstance.status` and persists auto-skip results). The
   * admin "recalculate" action must never mutate results or completion status, only the score.
   * Accepts an optional transaction client so `ChecklistSessionService.recalculateScore` can read
   * the results under the same Serializable isolation as its own write, closing the race with a
   * concurrent item-result submission.
   */
  async computeInstanceScore(instanceId: string, organizationId: string, client: Prisma.TransactionClient = this.prisma, formula: ChecklistScoreFormula = 'snapshot') {
    const instance = await client.checklistInstance.findFirst({
      where: { id: instanceId, organizationId, deletedAt: null },
      select: { checklistId: true, templateSnapshot: true, snapshotVersion: true },
    });
    if (!instance) throw new NotFoundException('Checklist assignment not found');

    const checklist = await this.resolveRuntimeChecklist(instance, organizationId);
    const results = await client.checklistItemResult.findMany({
      where: { instanceId },
      select: { itemId: true, checked: true, scaleLevel: true, points: true, photoObjectKey: true, reviewStatus: true, answerState: true },
    });
    const itemIds = new Set(checklist.items.map((item) => item.id));
    const relevantResults = results.filter((result) => itemIds.has(result.itemId));
    const resultByItemId = new Map<string, CompletionResult>(relevantResults.map((result) => [result.itemId, result]));

    // Criteria mode counts valid marks equally: checkbox=true or a selected scale level.
    // Missing answers stay in the denominator; explicit skips do not. Rejected answers earn 0.
    const criteria = checklist.items.filter((item) => resultByItemId.get(item.id)?.answerState !== 'skipped');
    const { totalScore, maxScore, scored } = formula === 'criteria'
      ? { totalScore: criteria.filter((item) => {
          const result = resultByItemId.get(item.id);
          return result?.reviewStatus !== 'rejected' && this.hasValidAnswer(checklist.scoringMode, result, item);
        }).length, maxScore: criteria.length, scored: criteria.length > 0 }
      : this.computeAggregateScore(checklist.items, checklist.scoringMode, checklist.scaleLevels, resultByItemId);
    const percentage = scored ? Math.round((totalScore / maxScore) * 100) : 0;
    return { totalScore, maxScore, scored, percentage, passThreshold: checklist.passThreshold };
  }

  /**
   * PR 370: per-criterion view of the very same calculation `computeInstanceScore` runs, for the
   * detailed session report. Every number comes from the frozen snapshot plus the persisted
   * results through `computeItemMax` / `hasValidAnswer` (snapshot formula) or the equal-weight
   * marks rule (criteria formula, PR 362), so the report can never disagree with the score the
   * session list and analytics show. Rows follow the sheet order: groups by their order, criteria
   * by their order inside a group; criteria without a group come last.
   */
  async getScoreBreakdown(instanceId: string, organizationId: string, formula: ChecklistScoreFormula = 'snapshot') {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { id: instanceId, organizationId },
      select: { checklistId: true, templateSnapshot: true, snapshotVersion: true },
    });
    if (!instance) throw new NotFoundException('Checklist assignment not found');

    const checklist = await this.resolveRuntimeChecklist(instance, organizationId);
    const results = await this.prisma.checklistItemResult.findMany({
      where: { instanceId },
      select: {
        itemId: true, checked: true, scaleLevel: true, points: true, comment: true, photoObjectKey: true,
        photoFileName: true, reviewStatus: true, answerState: true,
      },
    });
    const resultByItemId = new Map(results.map((result) => [result.itemId, result]));
    const groups = [...(checklist.itemGroups ?? [])].sort((a, b) => a.order - b.order);
    const groupRank = new Map(groups.map((group, index) => [group.id, index]));
    const orderedItems = [...checklist.items].sort((a, b) => {
      const rankA = a.groupId ? groupRank.get(a.groupId) ?? groups.length : groups.length;
      const rankB = b.groupId ? groupRank.get(b.groupId) ?? groups.length : groups.length;
      return rankA - rankB || a.order - b.order;
    });

    const rows = orderedItems.map((item) => {
      const result = resultByItemId.get(item.id) ?? null;
      const skipped = result?.answerState === 'skipped';
      const answered = this.hasValidAnswer(checklist.scoringMode, result ?? undefined, item);
      const weight = item.weight ?? 1;
      let earned = 0;
      let max = 0;
      if (!skipped) {
        if (formula === 'criteria') {
          max = 1;
          earned = result?.reviewStatus !== 'rejected' && answered ? 1 : 0;
        } else {
          max = this.computeItemMax(checklist.scoringMode, item, checklist.scaleLevels as ScaleLevel[] | null) * weight;
          const points = result && result.reviewStatus !== 'rejected'
            ? item.scale ? item.scale.levels.find((level) => level.value === result.scaleLevel)?.score ?? 0 : result.points ?? 0
            : 0;
          earned = points * weight;
        }
      }
      return { item, result, state: skipped ? ('skipped' as const) : answered ? ('answered' as const) : ('unanswered' as const), earned, max };
    });

    const totalScore = rows.reduce((sum, row) => sum + row.earned, 0);
    const maxScore = rows.reduce((sum, row) => sum + row.max, 0);
    return {
      checklist: {
        title: checklist.title,
        scoringMode: checklist.scoringMode,
        passThreshold: checklist.passThreshold,
        scaleLevels: checklist.scaleLevels as ScaleLevel[] | null,
        feedbackEnabled: checklist.feedbackEnabled ?? true,
        itemGroups: groups.map((group) => ({ id: group.id, title: group.title, order: group.order })),
      },
      rows,
      totals: { totalScore: Math.round(totalScore), maxScore: Math.round(maxScore), scored: maxScore > 0 },
    };
  }

  async assertInstanceWritable(
    instanceId: string,
    organizationId: string,
    requesterId: string,
    isPrivileged: boolean,
    now = new Date(),
  ) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { id: instanceId, organizationId, deletedAt: null },
      select: { id: true, userId: true, status: true, dueAt: true, session: { select: { observerId: true, deletedAt: true } } },
    });

    if (!instance) {
      throw new NotFoundException('Checklist assignment not found');
    }

    await this.assertWritableInstance(instance, organizationId, requesterId, isPrivileged, now);
  }

  async submitItemResult(
    instanceId: string,
    itemId: string,
    organizationId: string,
    requesterId: string,
    isPrivileged: boolean,
    input: SubmitChecklistItemResultInput,
  ) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { id: instanceId, organizationId, deletedAt: null },
      select: {
        id: true,
        userId: true,
        status: true,
        dueAt: true,
        checklistId: true,
        templateSnapshot: true,
        snapshotVersion: true,
        session: { select: { observerId: true, deletedAt: true } },
      },
    });

    if (!instance) {
      throw new NotFoundException('Checklist assignment not found');
    }

    await this.assertWritableInstance(instance, organizationId, requesterId, isPrivileged, new Date());

    const checklist = await this.resolveRuntimeChecklist(instance, organizationId);
    const item = checklist.items.find((candidate) => candidate.id === itemId);

    if (!item) {
      throw new NotFoundException('Checklist item not found');
    }

    const answersCriterion = input.checked !== undefined || input.scaleLevel !== undefined;
    const points = answersCriterion ? this.computeItemPoints(
      checklist.scoringMode,
      item,
      checklist.scaleLevels,
      input,
    ) : 0;

    await this.prisma.checklistItemResult.upsert({
      where: { instanceId_itemId: { instanceId, itemId } },
      create: {
        organizationId,
        instanceId,
        itemId,
        checked: input.checked ?? false,
        scaleLevel: input.scaleLevel,
        points,
        photoUrl: input.photoUrl,
        comment: input.comment,
        answerState: answersCriterion ? 'answered' : 'unanswered',
      },
      update: {
        photoUrl: input.photoUrl,
        comment: input.comment,
        // Metadata-only saves preserve the selected level, points and skip/review state.
        ...(answersCriterion ? {
          checked: input.checked ?? false,
          scaleLevel: input.scaleLevel,
          points,
          answerState: 'answered',
          reviewStatus: 'pending',
          reviewedBy: null,
          reviewedAt: null,
        } : {}),
      },
    });

    const updated = await this.recomputeInstance(instanceId, organizationId);
    await this.recordMutationEvents(organizationId, instanceId, requesterId, itemId, 'item_answered', instance.status, updated.status);
    return updated;
  }

  async skipItem(
    instanceId: string,
    itemId: string,
    organizationId: string,
    requesterId: string,
    isPrivileged: boolean,
    input: SkipChecklistItemInput,
  ) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { id: instanceId, organizationId, deletedAt: null },
      select: {
        id: true,
        userId: true,
        status: true,
        dueAt: true,
        checklistId: true,
        templateSnapshot: true,
        snapshotVersion: true,
        session: { select: { observerId: true, deletedAt: true } },
      },
    });

    if (!instance) {
      throw new NotFoundException('Checklist assignment not found');
    }

    await this.assertWritableInstance(instance, organizationId, requesterId, isPrivileged, new Date());

    const checklist = await this.resolveRuntimeChecklist(instance, organizationId);
    const item = checklist.items.find((candidate) => candidate.id === itemId);

    if (!item) {
      throw new NotFoundException('Checklist item not found');
    }

    if (!(item.allowSkip ?? false) && checklist.allowSkipAll !== true) {
      throw new BadRequestException('This checklist item cannot be skipped');
    }

    const existing = await this.prisma.checklistItemResult.findUnique({
      where: { instanceId_itemId: { instanceId, itemId } },
      select: { photoObjectKey: true },
    });

    await this.prisma.checklistItemResult.upsert({
      where: { instanceId_itemId: { instanceId, itemId } },
      create: {
        organizationId,
        instanceId,
        itemId,
        checked: false,
        scaleLevel: null,
        points: 0,
        comment: input.comment,
        answerState: 'skipped',
      },
      update: {
        checked: false,
        scaleLevel: null,
        points: 0,
        photoUrl: null,
        photoObjectKey: null,
        photoFileName: null,
        photoMimeType: null,
        photoSizeBytes: null,
        comment: input.comment,
        answerState: 'skipped',
        reviewStatus: 'pending',
        reviewedBy: null,
        reviewedAt: null,
      },
    });

    if (existing?.photoObjectKey) {
      await this.uploadService.deleteObject(existing.photoObjectKey).catch(() => undefined);
    }

    const updated = await this.recomputeInstance(instanceId, organizationId);
    await this.recordMutationEvents(organizationId, instanceId, requesterId, itemId, 'item_answered', instance.status, updated.status);
    return updated;
  }

  async reviewItemResult(
    instanceId: string,
    itemId: string,
    organizationId: string,
    reviewerId: string,
    input: ReviewChecklistItemResultInput,
  ) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { id: instanceId, organizationId, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!instance) {
      throw new NotFoundException('Checklist assignment not found');
    }

    if (instance.status !== 'submitted') {
      throw new BadRequestException('This checklist assignment is not awaiting review');
    }

    const result = await this.prisma.checklistItemResult.findUnique({
      where: { instanceId_itemId: { instanceId, itemId } },
      select: { id: true },
    });

    if (!result) {
      throw new NotFoundException('Checklist item result not found');
    }

    await this.prisma.checklistItemResult.update({
      where: { instanceId_itemId: { instanceId, itemId } },
      data: {
        reviewStatus: input.status,
        reviewComment: input.comment,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      },
    });

    const updated = await this.recomputeInstance(instanceId, organizationId);
    await this.recordMutationEvents(organizationId, instanceId, reviewerId, itemId, input.status === 'approved' ? 'item_approved' : 'item_rejected', instance.status, updated.status);
    return updated;
  }

  async attachItemPhoto(
    instanceId: string,
    itemId: string,
    organizationId: string,
    requesterId: string,
    isPrivileged: boolean,
    photo: { objectKey: string; fileName: string; mimeType: string; sizeBytes: number },
  ) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { id: instanceId, organizationId, deletedAt: null },
      select: { id: true, userId: true, status: true, dueAt: true, session: { select: { observerId: true, deletedAt: true } } },
    });

    if (!instance) {
      throw new NotFoundException('Checklist assignment not found');
    }

    await this.assertWritableInstance(instance, organizationId, requesterId, isPrivileged, new Date());

    const existing = await this.prisma.checklistItemResult.findUnique({
      where: { instanceId_itemId: { instanceId, itemId } },
      select: { photoObjectKey: true },
    });

    if (!existing) {
      throw new BadRequestException('Mark this item before attaching a photo');
    }

    const previousObjectKey = existing.photoObjectKey;

    await this.prisma.checklistItemResult.update({
      where: { instanceId_itemId: { instanceId, itemId } },
      data: {
        photoObjectKey: photo.objectKey,
        photoFileName: photo.fileName,
        photoMimeType: photo.mimeType,
        photoSizeBytes: photo.sizeBytes,
      },
    });

    if (previousObjectKey) {
      await this.uploadService.deleteObject(previousObjectKey).catch(() => undefined);
    }

    const updated = await this.recomputeInstance(instanceId, organizationId);
    await this.recordMutationEvents(organizationId, instanceId, requesterId, itemId, 'photo_attached', instance.status, updated.status);
    return updated;
  }

  async getItemPhotoDownload(
    instanceId: string,
    itemId: string,
    organizationId: string,
    requesterId: string,
    isPrivileged: boolean,
  ) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { id: instanceId, organizationId, deletedAt: null },
      select: { userId: true, reviewerId: true },
    });

    if (!instance) {
      throw new NotFoundException('Checklist assignment not found');
    }

    if (instance.userId !== requesterId && !isPrivileged) {
      throw new ForbiddenException('You can only view your own checklist assignment');
    }

    const result = await this.prisma.checklistItemResult.findUnique({
      where: { instanceId_itemId: { instanceId, itemId } },
      select: { id: true, photoObjectKey: true, photoMimeType: true },
    });

    if (!result?.photoObjectKey) {
      throw new NotFoundException('No photo attached to this item');
    }

    const expiresIn = 300;
    const url = await this.uploadService.getInlinePresignedUrl(
      result.photoObjectKey,
      result.photoMimeType ?? 'image/jpeg',
      expiresIn,
    );

    const isOutsideNormalWorkflow = instance.userId !== requesterId && instance.reviewerId !== requesterId;
    if (isPrivileged && isOutsideNormalWorkflow) {
      await this.auditLog.record({
        organizationId,
        actorId: requesterId,
        action: 'checklist_evidence.accessed',
        targetType: 'checklist_item_result',
        targetId: result.id,
        summary: 'Viewed photo evidence for a checklist assignment outside own review assignment',
        metadata: { instanceId, itemId },
      });
    }

    return { url, expiresIn };
  }

  private async listInstancesWithDeadlineRefresh(scope: { organizationId: string; userId?: string; checklistId?: string }) {
    let instances = await this.prisma.checklistInstance.findMany({
      where: { ...scope, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: instanceWithSnapshotSelect,
    });
    const now = new Date();

    if (instances.some((instance) => this.shouldExpire(instance.status, instance.dueAt, now))) {
      await expireDueChecklistInstances(this.prisma, scope, now);
      instances = await this.prisma.checklistInstance.findMany({
        where: { ...scope, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: instanceWithSnapshotSelect,
      });
    }

    return instances.map((instance) => this.presentInstance(instance));
  }

  private shouldExpire(status: string, dueAt: Date | null, now: Date) {
    return (status === 'assigned' || status === 'in_progress') && isChecklistDeadlineReached(dueAt, now);
  }

  private async assertWritableInstance(
    instance: WritableInstance,
    organizationId: string,
    requesterId: string,
    isPrivileged: boolean,
    now: Date,
  ) {
    const session = instance.session;
    if (session && (session.deletedAt !== null || session.observerId !== requesterId)) {
      throw new NotFoundException('Checklist session not found');
    }
    if (!session && instance.userId !== requesterId && !isPrivileged) {
      throw new ForbiddenException('You can only fill out your own checklist assignment');
    }

    if (instance.status === 'expired') {
      throw new BadRequestException(CHECKLIST_EXPIRED_MESSAGE);
    }

    if (instance.status === 'submitted' || instance.status === 'completed') {
      throw new BadRequestException('This checklist assignment is no longer editable');
    }

    if (isChecklistDeadlineReached(instance.dueAt, now)) {
      await expireDueChecklistInstances(this.prisma, { id: instance.id, organizationId }, now);
      throw new BadRequestException(CHECKLIST_EXPIRED_MESSAGE);
    }
  }

  /**
   * PR 293: resolves each item's `scaleId` (if any) against the live ChecklistScale table and
   * embeds the result as `scale` -- this is the one and only place a live scale lookup happens;
   * everywhere else (scoring, review, display) reads the already-resolved `scale` back out of the
   * instance's templateSnapshot, never re-queries ChecklistScale. Called once per snapshot build
   * (at assignment, or when regenerating a legacy pre-snapshot instance's runtime view), so a
   * later edit or archival of the scale can never retroactively change an existing instance.
   */
  private async attachItemScales<T extends { scaleId: string | null }>(
    db: Prisma.TransactionClient | PrismaService,
    organizationId: string,
    items: T[],
  ): Promise<(T & { scale: ChecklistSnapshotItemScale | null })[]> {
    const scaleIds = [...new Set(items.map((item) => item.scaleId).filter((id): id is string => id != null))];
    const scaleMap = new Map<string, ChecklistSnapshotItemScale>();
    if (scaleIds.length > 0) {
      const scales = await db.checklistScale.findMany({
        where: { id: { in: scaleIds }, organizationId },
        include: { levels: { orderBy: { value: 'asc' } } },
      });
      for (const scale of scales) {
        scaleMap.set(scale.id, {
          id: scale.id,
          name: scale.name,
          levels: withResolvedLevelColors(scale.levels).map((level) => ({ value: level.value, label: level.label, score: level.score, color: level.color })),
        });
      }
    }

    return items.map((item) => ({ ...item, scale: item.scaleId ? (scaleMap.get(item.scaleId) ?? null) : null }));
  }

  private toRuntimeChecklist(
    checklist: {
      id: string;
      organizationId: string;
      title: string;
      description: string | null;
      status: string;
      scoringMode: string;
      passThreshold: number;
      scaleLevels: Prisma.JsonValue | null;
      requiresReview: boolean;
      contextFields?: Prisma.JsonValue | null;
      defaultLocationCapturePolicy?: string | null;
      preSessionVisibility?: string;
      allowFinishIncomplete?: boolean;
      forbidGalleryPhotos?: boolean;
      feedbackEnabled?: boolean;
      feedbackRequired?: boolean;
      allowSkipAll?: boolean;
      itemGroups?: ChecklistSnapshotItemGroup[];
    },
    items: ChecklistSnapshotItem[],
  ): ChecklistRuntime {
    return {
      id: checklist.id,
      organizationId: checklist.organizationId,
      title: checklist.title,
      description: checklist.description,
      status: checklist.status,
      scoringMode: checklist.scoringMode,
      passThreshold: checklist.passThreshold,
      scaleLevels: checklist.scaleLevels as ScaleLevel[] | null,
      requiresReview: checklist.requiresReview,
      contextFields: checklist.contextFields as ContextField[] | null | undefined,
      defaultLocationCapturePolicy: checklist.defaultLocationCapturePolicy,
      preSessionVisibility: checklist.preSessionVisibility,
      allowFinishIncomplete: checklist.allowFinishIncomplete,
      forbidGalleryPhotos: checklist.forbidGalleryPhotos,
      feedbackEnabled: checklist.feedbackEnabled,
      feedbackRequired: checklist.feedbackRequired,
      allowSkipAll: checklist.allowSkipAll,
      itemGroups: checklist.itemGroups?.map((group) => ({ ...group })),
      items: items.map((item) => ({ ...item })),
    };
  }

  private buildTemplateSnapshot(checklist: ChecklistRuntime): ChecklistTemplateSnapshot {
    return {
      version: CHECKLIST_SNAPSHOT_VERSION,
      checklist: {
        ...checklist,
        itemGroups: checklist.itemGroups?.map((group) => ({ ...group })),
        scaleLevels: checklist.scaleLevels?.map((level) => ({ ...level })) ?? null,
        items: checklist.items.map((item) => ({
          ...item,
          scale: item.scale ? { ...item.scale, levels: item.scale.levels.map((level) => ({ ...level })) } : item.scale,
        })),
      },
    };
  }

  private parseTemplateSnapshot(value: Prisma.JsonValue | null | undefined): ChecklistTemplateSnapshot | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const snapshot = value as unknown as Partial<ChecklistTemplateSnapshot>;
    const checklist = snapshot.checklist;
    if (
      snapshot.version !== CHECKLIST_SNAPSHOT_VERSION ||
      !checklist ||
      typeof checklist !== 'object' ||
      Array.isArray(checklist) ||
      typeof checklist.id !== 'string' ||
      typeof checklist.organizationId !== 'string' ||
      typeof checklist.title !== 'string' ||
      (checklist.description !== null && typeof checklist.description !== 'string') ||
      typeof checklist.status !== 'string' ||
      typeof checklist.scoringMode !== 'string' ||
      typeof checklist.passThreshold !== 'number' ||
      (checklist.scaleLevels !== null && !Array.isArray(checklist.scaleLevels)) ||
      typeof checklist.requiresReview !== 'boolean' ||
      !Array.isArray(checklist.items) ||
      !checklist.items.every(
        (item) =>
          item &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          typeof item.checklistId === 'string' &&
          typeof item.order === 'number' &&
          typeof item.text === 'string' &&
          typeof item.points === 'number' &&
          typeof item.isRequired === 'boolean' &&
          typeof item.photoRequired === 'boolean',
      )
    ) {
      return null;
    }

    return snapshot as ChecklistTemplateSnapshot;
  }

  private getStoredSnapshot(instance: SnapshotRuntimeRef): ChecklistTemplateSnapshot | null {
    if (instance.templateSnapshot == null) {
      return null;
    }

    if (instance.snapshotVersion !== CHECKLIST_SNAPSHOT_VERSION) {
      throw new BadRequestException('Unsupported checklist assignment snapshot version');
    }

    const snapshot = this.parseTemplateSnapshot(instance.templateSnapshot);
    if (!snapshot) {
      throw new BadRequestException('Invalid checklist assignment snapshot');
    }

    return snapshot;
  }

  private async resolveRuntimeChecklist(instance: SnapshotRuntimeRef, organizationId: string): Promise<ChecklistRuntime> {
    const snapshot = this.getStoredSnapshot(instance);
    if (snapshot) {
      return snapshot.checklist;
    }

    const [checklist, items] = await Promise.all([
      this.prisma.checklist.findFirstOrThrow({
        where: { id: instance.checklistId, organizationId },
        select: checklistWithGroupsSelect,
      }),
      this.prisma.checklistItem.findMany({
        where: { checklistId: instance.checklistId, deletedAt: null },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          checklistId: true,
          order: true,
          text: true,
          points: true,
          isRequired: true,
          photoRequired: true,
          weight: true,
          allowSkip: true,
          autoSkipUnanswered: true,
          scaleId: true,
          groupId: true,
        },
      }),
    ]);

    const itemsWithScale = await this.attachItemScales(this.prisma, organizationId, items);
    return this.toRuntimeChecklist(checklist, itemsWithScale);
  }

  private presentInstance(instance: SnapshotInstance) {
    const snapshot = this.getStoredSnapshot(instance);
    // PR 330: the strictness settings come from the frozen snapshot only (a snapshot taken before
    // they existed reads as false), never from the live checklist, so editing a checklist later
    // can't change how an already-assigned instance behaves.
    const checklist = snapshot
      ? {
          ...instance.checklist,
          ...snapshot.checklist,
          // A historical snapshot without groups must not borrow today's live group names.
          itemGroups: snapshot.checklist.itemGroups ?? [],
          allowFinishIncomplete: snapshot.checklist.allowFinishIncomplete ?? false,
          forbidGalleryPhotos: snapshot.checklist.forbidGalleryPhotos ?? false,
          feedbackEnabled: snapshot.checklist.feedbackEnabled ?? true,
          feedbackRequired: snapshot.checklist.feedbackRequired ?? false,
          allowSkipAll: snapshot.checklist.allowSkipAll ?? false,
        }
      : instance.checklist;

    return {
      id: instance.id,
      organizationId: instance.organizationId,
      checklistId: instance.checklistId,
      userId: instance.userId,
      assignedBy: instance.assignedBy,
      reviewerId: instance.reviewerId,
      reviewAssignedAt: instance.reviewAssignedAt,
      reviewAssignedBy: instance.reviewAssignedBy,
      status: instance.status,
      totalScore: instance.totalScore,
      maxScore: instance.maxScore,
      percentage: instance.percentage,
      passed: instance.passed,
      scored: instance.scored,
      dueAt: instance.dueAt,
      submittedAt: instance.submittedAt,
      completedAt: instance.completedAt,
      createdAt: instance.createdAt,
      updatedAt: instance.updatedAt,
      checklist,
      results: instance.results,
    };
  }

  private itemScaleLevels(item: ItemScaleRef, scoringMode: string, scaleLevels: ScaleLevel[] | null): ScaleLevel[] | null {
    if (item.scale) return item.scale.levels.map((level) => ({ level: level.value, label: level.label, points: level.score }));
    return scoringMode === 'scale' ? scaleLevels ?? [] : null;
  }

  private computeItemPoints(
    scoringMode: string,
    item: ItemScaleRef & { points: number },
    scaleLevels: ScaleLevel[] | null,
    input: SubmitChecklistItemResultInput,
  ) {
    const levels = this.itemScaleLevels(item, scoringMode, scaleLevels);
    if (levels !== null) {
      const level = levels.find((candidate) => candidate.level === input.scaleLevel);

      if (!level) {
        throw new BadRequestException(item.scale ? 'Select a valid level from this criterion’s evaluation scale' : 'Invalid scale level for this checklist');
      }

      return level.points;
    }

    if (scoringMode === 'all_required') {
      return input.checked ? 1 : 0;
    }

    // sum_points
    return input.checked ? item.points : 0;
  }

  // Assignment-time estimate only (used before any ChecklistItemResult exists, to seed the
  // instance's initial maxScore) -- assumes nothing skipped, since skip is a per-result state.
  // recomputeInstance() supersedes this with computeAggregateScore() as soon as any result exists.
  private computeMaxScore(items: ScoringItem[], scoring: { scoringMode: string; scaleLevels: unknown }) {
    return items.reduce((sum, item) => sum + this.computeItemMax(scoring.scoringMode, item, scoring.scaleLevels as ScaleLevel[] | null) * (item.weight ?? 1), 0);
  }

  private computeItemMax(scoringMode: string, item: ItemScaleRef & { points: number }, scaleLevels: ScaleLevel[] | null) {
    const levels = this.itemScaleLevels(item, scoringMode, scaleLevels);
    if (levels !== null) {
      return levels.reduce((max, level) => Math.max(max, level.points), 0);
    }

    if (scoringMode === 'all_required') {
      return 1;
    }

    return item.points;
  }

  private hasValidAnswer(scoringMode: string, result: CompletionResult | undefined, item?: ItemScaleRef) {
    if (!result || result.answerState === 'skipped') return false;
    if (item?.scale) return item.scale.levels.some((level) => level.value === result.scaleLevel);
    return scoringMode === 'scale' ? result.scaleLevel !== null : result.checked;
  }

  private isItemSatisfied(scoringMode: string, item: CompletionItem, result: CompletionResult | undefined) {
    // A skipped item (explicit or auto-skipped) is a resolved item -- it never blocks
    // completion, regardless of isRequired: allowSkip is what an admin uses to say "this
    // criterion doesn't have to block the session," and skip is only reachable when it's true.
    if (result?.answerState === 'skipped') {
      return true;
    }

    const hasAnswer = this.hasValidAnswer(scoringMode, result, item);

    if (!hasAnswer) {
      return !item.isRequired;
    }

    return !item.photoRequired || Boolean(result?.photoObjectKey);
  }

  /**
   * ADR_CHECKLIST_SESSION_OVERLAY.md scoring v1: skipped items are excluded from BOTH the
   * numerator and denominator (a skip must not count as zero and must not inflate the max an
   * unanswerable item is scored against), each item's earned/max is multiplied by its
   * `weight` (default 1 -- a no-op for every pre-PR-290 checklist), and `scored=false` when the
   * resulting max is zero (e.g. every item got skipped) so the caller never reports a
   * misleading 0% for "nothing was actually scored."
   */
  private computeAggregateScore(
    items: ScoringItem[],
    scoringMode: string,
    scaleLevels: ScaleLevel[] | null,
    resultByItemId: Map<string, CompletionResult>,
  ): { totalScore: number; maxScore: number; scored: boolean } {
    let totalScore = 0;
    let maxScore = 0;

    for (const item of items) {
      const result = resultByItemId.get(item.id);
      if (result?.answerState === 'skipped') {
        continue;
      }

      const weight = item.weight ?? 1;
      maxScore += this.computeItemMax(scoringMode, item, scaleLevels) * weight;

      const earned = result && result.reviewStatus !== 'rejected'
        ? item.scale ? item.scale.levels.find((level) => level.value === result.scaleLevel)?.score ?? 0 : result.points ?? 0
        : 0;
      totalScore += earned * weight;
    }

    return { totalScore: Math.round(totalScore), maxScore: Math.round(maxScore), scored: maxScore > 0 };
  }

  /**
   * PR 330: called when an observer completes a session on a checklist whose frozen snapshot has
   * `allowFinishIncomplete`. Every criterion still without an answer is recorded as skipped (the
   * same persisted `answerState='skipped'` row auto-skip writes, so scoring v1 leaves it out of
   * both numerator and denominator) and the instance is recomputed. A no-op when the snapshot
   * does not allow it, so a stricter checklist still needs every required criterion answered.
   */
  async finishIncompleteInstance(instanceId: string, organizationId: string) {
    return this.recomputeInstance(instanceId, organizationId, { skipAllUnanswered: true });
  }

  /**
   * PR 369: an evaluation scale may be edited while checklists using it are assigned. Instances
   * keep a frozen copy of the levels, so an instance whose session has not started yet is brought
   * up to date when the observer starts it. Once any answer exists the snapshot is left alone, so
   * started and finished work is never re-scored. A scale that no longer exists keeps its copy.
   */
  async refreshScaleSnapshot(instanceId: string, organizationId: string) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { id: instanceId, organizationId },
      select: { templateSnapshot: true, _count: { select: { results: true } } },
    });
    if (!instance || instance._count.results > 0 || instance.templateSnapshot == null) return;

    const snapshot = this.parseTemplateSnapshot(instance.templateSnapshot);
    if (!snapshot) return;
    const scaled = snapshot.checklist.items.filter((item) => item.scaleId);
    if (scaled.length === 0) return;

    const fresh = await this.attachItemScales(this.prisma, organizationId, scaled as (ChecklistSnapshotItem & { scaleId: string })[]);
    const freshById = new Map(fresh.map((item) => [item.id, item.scale]));
    let changed = false;
    const items = snapshot.checklist.items.map((item) => {
      const scale = freshById.get(item.id);
      if (!scale || JSON.stringify(scale) === JSON.stringify(item.scale)) return item;
      changed = true;
      return { ...item, scale };
    });
    if (!changed) return;

    await this.prisma.checklistInstance.update({
      where: { id: instanceId },
      data: { templateSnapshot: { ...snapshot, checklist: { ...snapshot.checklist, items } } as unknown as Prisma.InputJsonValue },
    });
  }

  private async recomputeInstance(instanceId: string, organizationId: string, options: { skipAllUnanswered?: boolean } = {}) {
    const instance = await this.prisma.checklistInstance.findFirstOrThrow({
      where: { id: instanceId, organizationId },
      select: {
        checklistId: true,
        status: true,
        dueAt: true,
        templateSnapshot: true,
        snapshotVersion: true,
        reportSettings: true,
      },
    });

    if (instance.status === 'expired') {
      return this.getInstance(instanceId, organizationId);
    }

    const now = new Date();
    if (this.shouldExpire(instance.status, instance.dueAt, now)) {
      await expireDueChecklistInstances(this.prisma, { id: instanceId, organizationId }, now);
      return this.getInstance(instanceId, organizationId);
    }

    const checklist = await this.resolveRuntimeChecklist(instance, organizationId);
    const results = await this.prisma.checklistItemResult.findMany({
      where: { instanceId },
      select: {
        itemId: true,
        checked: true,
        scaleLevel: true,
        points: true,
        photoObjectKey: true,
        reviewStatus: true,
        answerState: true,
      },
    });
    const itemIds = new Set(checklist.items.map((item) => item.id));
    const relevantResults = results.filter((result) => itemIds.has(result.itemId));
    const resultByItemId = new Map<string, CompletionResult>(relevantResults.map((result) => [result.itemId, result]));

    // Auto-skip: an item with autoSkipUnanswered=true that has no valid answer on file resolves
    // itself as skipped -- persisted as a real ChecklistItemResult row (not just a computed
    // value) so it shows up in the audit trail the same way an explicit skip does.
    const skipAllUnanswered = options.skipAllUnanswered === true && checklist.allowFinishIncomplete === true;
    const autoSkipCandidates = checklist.items.filter((item) => {
      if (!item.autoSkipUnanswered && !skipAllUnanswered) return false;
      const result = resultByItemId.get(item.id);
      if (result?.answerState === 'skipped') return false;
      return !this.hasValidAnswer(checklist.scoringMode, result, item);
    });
    if (autoSkipCandidates.length > 0) {
      await this.prisma.$transaction(
        autoSkipCandidates.map((item) =>
          this.prisma.checklistItemResult.upsert({
            where: { instanceId_itemId: { instanceId, itemId: item.id } },
            create: { organizationId, instanceId, itemId: item.id, answerState: 'skipped', points: 0 },
            update: {
              checked: false,
              scaleLevel: null,
              points: 0,
              answerState: 'skipped',
              reviewStatus: 'pending',
              reviewedBy: null,
              reviewedAt: null,
            },
          }),
        ),
      );
      for (const item of autoSkipCandidates) {
        resultByItemId.set(item.id, {
          itemId: item.id,
          checked: false,
          scaleLevel: null,
          photoObjectKey: null,
          reviewStatus: 'pending',
          answerState: 'skipped',
        });
      }
    }

    const allRequirementsSatisfied =
      checklist.items.length > 0 &&
      checklist.items.every((item) => this.isItemSatisfied(checklist.scoringMode, item, resultByItemId.get(item.id)));
    const itemById = new Map(checklist.items.map((item) => [item.id, item]));
    const reviewableResults = [...resultByItemId.values()].filter((result) => this.hasValidAnswer(checklist.scoringMode, result, itemById.get(result.itemId)));
    const allReviewed = reviewableResults.every((result) => result.reviewStatus !== 'pending');

    let status = instance.status;
    let submittedAt: Date | undefined;
    let completedAt: Date | undefined;

    if (allRequirementsSatisfied && checklist.requiresReview && reviewableResults.length === 0) {
      status = 'completed';
      completedAt = now;
    } else if (
      allRequirementsSatisfied &&
      checklist.requiresReview &&
      status !== 'submitted' &&
      status !== 'completed'
    ) {
      status = 'submitted';
      submittedAt = now;
    } else if (
      allRequirementsSatisfied &&
      checklist.requiresReview &&
      status === 'submitted' &&
      allReviewed
    ) {
      status = 'completed';
      completedAt = now;
    } else if (allRequirementsSatisfied && !checklist.requiresReview) {
      status = 'completed';
      completedAt = now;
    } else if (!allRequirementsSatisfied && status === 'assigned') {
      status = 'in_progress';
    }

    const { totalScore, maxScore, scored } = this.computeAggregateScore(
      checklist.items,
      checklist.scoringMode,
      checklist.scaleLevels,
      resultByItemId,
    );
    const percentage = scored ? Math.round((totalScore / maxScore) * 100) : 0;
    const passed = scored && status === 'completed' && percentage >= checklist.passThreshold;

    // PR 397: the thresholds and colours the report paints from are frozen at the first completion, so a later
    // edit of the organization or sheet settings never repaints a finished report.
    const reportSettings = completedAt && instance.reportSettings == null
      ? freezeReportSettings(await loadEffectiveSettings(this.prisma, organizationId, instance.checklistId))
      : undefined;

    try {
      const updated = await this.prisma.checklistInstance.update({
        where: { id: instanceId, organizationId, status: { not: 'expired' } },
        data: {
          status,
          ...(reportSettings ? { reportSettings: reportSettings as unknown as Prisma.InputJsonValue } : {}),
          totalScore,
          maxScore,
          percentage,
          passed,
          scored,
          ...(submittedAt ? { submittedAt } : {}),
          ...(completedAt ? { completedAt } : {}),
        },
        select: instanceWithSnapshotSelect,
      });
      return this.presentInstance(updated);
    } catch (error) {
      if (this.isRecordNotFound(error)) return this.getInstance(instanceId, organizationId);
      throw error;
    }
  }

  private isRecordNotFound(error: unknown) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2025');
  }
}
