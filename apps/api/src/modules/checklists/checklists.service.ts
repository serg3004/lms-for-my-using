import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { UploadService } from '../upload/public.js';
import {
  AssignChecklistInput,
  BulkAssignChecklistInput,
  ChecklistAnalyticsQuery,
  ChecklistQueueQuery,
  CreateChecklistInput,
  CreateChecklistItemInput,
  ReviewChecklistItemResultInput,
  ScaleLevel,
  SubmitChecklistItemResultInput,
  UpdateChecklistInput,
  UpdateChecklistItemInput,
  MAX_BULK_CHECKLIST_RECIPIENTS,
} from './checklists.schemas.js';
import {
  CHECKLIST_EXPIRED_MESSAGE,
  expireDueChecklistInstances,
  isChecklistDeadlineReached,
} from './checklist-deadlines.js';

const CHECKLIST_SNAPSHOT_VERSION = 1;

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
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

const checklistWithItemsSelect = {
  ...checklistSelect,
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
    },
  },
} as const;

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

type ScoringItem = { id: string; points: number; isRequired: boolean };
type CompletionItem = { id: string; isRequired: boolean; photoRequired: boolean };
type CompletionResult = {
  itemId: string;
  checked: boolean;
  scaleLevel: number | null;
  photoObjectKey: string | null;
  reviewStatus: string;
};
type ChecklistSnapshotItem = {
  id: string;
  checklistId: string;
  order: number;
  text: string;
  points: number;
  isRequired: boolean;
  photoRequired: boolean;
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
  id: string;
  userId: string;
  status: string;
  dueAt: Date | null;
};

@Injectable()
export class ChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
  ) {}

  // ---- Templates ----

  listChecklists(organizationId: string) {
    return this.prisma.checklist.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: checklistWithItemsSelect,
    });
  }

  async getChecklist(checklistId: string, organizationId: string) {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, organizationId, deletedAt: null },
      select: checklistWithItemsSelect,
    });

    if (!checklist) {
      throw new NotFoundException('Checklist not found');
    }

    return checklist;
  }

  async createChecklist(input: CreateChecklistInput, createdBy: string) {
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
      select: { id: true, scoringMode: true, scaleLevels: true },
    });

    if (!checklist) {
      throw new NotFoundException('Checklist not found');
    }

    if (input.status === 'published') {
      await this.ensurePublishable(
        checklistId,
        organizationId,
        input.scoringMode ?? checklist.scoringMode,
        input.scaleLevels ?? (checklist.scaleLevels as ScaleLevel[] | null),
      );
    }

    const { scaleLevels, ...rest } = input;

    const updated = await this.prisma.checklist.update({
      where: { id: checklistId, organizationId },
      data: {
        ...rest,
        ...(scaleLevels !== undefined
          ? { scaleLevels: scaleLevels === null ? Prisma.JsonNull : scaleLevels }
          : {}),
      },
      select: checklistWithItemsSelect,
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

    return updated;
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
      select: { id: true },
    });

    if (items.length === 0) {
      throw new BadRequestException('Cannot publish checklist: it has no items');
    }

    if (scoringMode === 'scale' && (!scaleLevels || scaleLevels.length < 2)) {
      throw new BadRequestException('Cannot publish checklist: scale scoring mode requires at least 2 levels');
    }
  }

  // ---- Items ----

  async listItems(checklistId: string, organizationId: string) {
    await this.getChecklist(checklistId, organizationId);

    return this.prisma.checklistItem.findMany({
      where: { checklistId, organizationId, deletedAt: null },
      orderBy: { order: 'asc' },
    });
  }

  async createItem(checklistId: string, organizationId: string, input: CreateChecklistItemInput) {
    await this.getChecklist(checklistId, organizationId);
    const count = await this.prisma.checklistItem.count({ where: { checklistId, deletedAt: null } });

    return this.prisma.checklistItem.create({
      data: { ...input, checklistId, organizationId, order: count },
    });
  }

  async updateItem(itemId: string, organizationId: string, input: UpdateChecklistItemInput) {
    const item = await this.prisma.checklistItem.findFirst({
      where: { id: itemId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!item) {
      throw new NotFoundException('Checklist item not found');
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

  async assignChecklist(checklistId: string, organizationId: string, input: AssignChecklistInput, assignedBy: string) {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, organizationId, deletedAt: null },
      select: checklistSelect,
    });

    if (!checklist) {
      throw new NotFoundException('Checklist not found');
    }

    if (checklist.status !== 'published') {
      throw new BadRequestException('Cannot assign a checklist that is not published');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: input.userId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const activeInstance = await this.prisma.checklistInstance.findFirst({
      where: { checklistId, userId: input.userId, status: { in: ['assigned', 'in_progress', 'submitted'] }, deletedAt: null },
      select: { id: true },
    });

    if (activeInstance) {
      throw new BadRequestException('This user already has an active assignment for this checklist');
    }

    const items = await this.prisma.checklistItem.findMany({
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
      },
    });
    const runtimeChecklist = this.toRuntimeChecklist(checklist, items);
    const snapshot = this.buildTemplateSnapshot(runtimeChecklist);

    const instance = await this.prisma.$transaction(async (transaction) => {
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
    });

    await this.auditLog.record({
      organizationId,
      actorId: assignedBy,
      action: 'checklist_instance.assigned',
      targetType: 'checklist_instance',
      targetId: instance.id,
      summary: `Assigned checklist ${checklist.title} to user`,
      metadata: { checklistId, userId: input.userId },
    });

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
      select: checklistSelect,
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
      select: { id: true, checklistId: true, order: true, text: true, points: true, isRequired: true, photoRequired: true },
    });
    const runtimeChecklist = this.toRuntimeChecklist(checklist, items);
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

  async listInstancesForChecklist(checklistId: string, organizationId: string) {
    return this.listInstancesWithDeadlineRefresh({ checklistId, organizationId });
  }

  async listPendingReview(organizationId: string) {
    const instances = await this.prisma.checklistInstance.findMany({
      where: { organizationId, status: 'submitted', deletedAt: null },
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

  async assertInstanceWritable(
    instanceId: string,
    organizationId: string,
    requesterId: string,
    isPrivileged: boolean,
    now = new Date(),
  ) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { id: instanceId, organizationId, deletedAt: null },
      select: { id: true, userId: true, status: true, dueAt: true },
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

    const points = this.computeItemPoints(
      checklist.scoringMode,
      item.points,
      checklist.scaleLevels,
      input,
    );

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
      },
      update: {
        checked: input.checked ?? false,
        scaleLevel: input.scaleLevel,
        points,
        photoUrl: input.photoUrl,
        comment: input.comment,
        reviewStatus: 'pending',
        reviewedBy: null,
        reviewedAt: null,
      },
    });

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
      select: { id: true, userId: true, status: true, dueAt: true },
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
      select: { userId: true },
    });

    if (!instance) {
      throw new NotFoundException('Checklist assignment not found');
    }

    if (instance.userId !== requesterId && !isPrivileged) {
      throw new ForbiddenException('You can only view your own checklist assignment');
    }

    const result = await this.prisma.checklistItemResult.findUnique({
      where: { instanceId_itemId: { instanceId, itemId } },
      select: { photoObjectKey: true, photoMimeType: true },
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
    if (instance.userId !== requesterId && !isPrivileged) {
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
      items: items.map((item) => ({ ...item })),
    };
  }

  private buildTemplateSnapshot(checklist: ChecklistRuntime): ChecklistTemplateSnapshot {
    return {
      version: CHECKLIST_SNAPSHOT_VERSION,
      checklist: {
        ...checklist,
        scaleLevels: checklist.scaleLevels?.map((level) => ({ ...level })) ?? null,
        items: checklist.items.map((item) => ({ ...item })),
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
        select: {
          id: true,
          organizationId: true,
          title: true,
          description: true,
          status: true,
          scoringMode: true,
          passThreshold: true,
          scaleLevels: true,
          requiresReview: true,
        },
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
        },
      }),
    ]);

    return this.toRuntimeChecklist(checklist, items);
  }

  private presentInstance(instance: SnapshotInstance) {
    const snapshot = this.getStoredSnapshot(instance);
    const checklist = snapshot
      ? { ...instance.checklist, ...snapshot.checklist }
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
      dueAt: instance.dueAt,
      submittedAt: instance.submittedAt,
      completedAt: instance.completedAt,
      createdAt: instance.createdAt,
      updatedAt: instance.updatedAt,
      checklist,
      results: instance.results,
    };
  }

  private computeItemPoints(
    scoringMode: string,
    itemPoints: number,
    scaleLevels: ScaleLevel[] | null,
    input: SubmitChecklistItemResultInput,
  ) {
    if (scoringMode === 'scale') {
      const level = (scaleLevels ?? []).find((candidate) => candidate.level === input.scaleLevel);

      if (!level) {
        throw new BadRequestException('Invalid scale level for this checklist');
      }

      return level.points;
    }

    if (scoringMode === 'all_required') {
      return input.checked ? 1 : 0;
    }

    // sum_points
    return input.checked ? itemPoints : 0;
  }

  private computeMaxScore(items: ScoringItem[], scoring: { scoringMode: string; scaleLevels: unknown }) {
    if (scoring.scoringMode === 'scale') {
      const levels = (scoring.scaleLevels as ScaleLevel[] | null) ?? [];
      const topPoints = levels.reduce((max, level) => Math.max(max, level.points), 0);
      return items.length * topPoints;
    }

    if (scoring.scoringMode === 'all_required') {
      return items.length;
    }

    return items.reduce((sum, item) => sum + item.points, 0);
  }

  private hasValidAnswer(scoringMode: string, result: CompletionResult | undefined) {
    if (!result) return false;
    return scoringMode === 'scale' ? result.scaleLevel !== null : result.checked;
  }

  private isItemSatisfied(scoringMode: string, item: CompletionItem, result: CompletionResult | undefined) {
    const hasAnswer = this.hasValidAnswer(scoringMode, result);

    if (!hasAnswer) {
      return !item.isRequired;
    }

    return !item.photoRequired || Boolean(result?.photoObjectKey);
  }

  private async recomputeInstance(instanceId: string, organizationId: string) {
    const instance = await this.prisma.checklistInstance.findFirstOrThrow({
      where: { id: instanceId, organizationId },
      select: {
        checklistId: true,
        status: true,
        dueAt: true,
        templateSnapshot: true,
        snapshotVersion: true,
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
      },
    });
    const itemIds = new Set(checklist.items.map((item) => item.id));
    const relevantResults = results.filter((result) => itemIds.has(result.itemId));
    const resultByItemId = new Map(relevantResults.map((result) => [result.itemId, result]));
    const allRequirementsSatisfied =
      checklist.items.length > 0 &&
      checklist.items.every((item) => this.isItemSatisfied(checklist.scoringMode, item, resultByItemId.get(item.id)));
    const reviewableResults = relevantResults.filter((result) => this.hasValidAnswer(checklist.scoringMode, result));
    const allReviewed = reviewableResults.every((result) => result.reviewStatus !== 'pending');
    const totalScore = relevantResults.reduce(
      (sum, result) => sum + (result.reviewStatus === 'rejected' ? 0 : result.points),
      0,
    );

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

    const maxScore = this.computeMaxScore(checklist.items, checklist);
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const passed = status === 'completed' && percentage >= checklist.passThreshold;

    try {
      const updated = await this.prisma.checklistInstance.update({
        where: { id: instanceId, organizationId, status: { not: 'expired' } },
        data: {
          status,
          totalScore,
          maxScore,
          percentage,
          passed,
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
