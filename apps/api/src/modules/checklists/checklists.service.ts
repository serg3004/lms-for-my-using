import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import {
  AssignChecklistInput,
  CreateChecklistInput,
  CreateChecklistItemInput,
  ReviewChecklistItemResultInput,
  ScaleLevel,
  SubmitChecklistItemResultInput,
  UpdateChecklistInput,
  UpdateChecklistItemInput,
} from './checklists.schemas.js';

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
      comment: true,
      reviewStatus: true,
      reviewComment: true,
      reviewedBy: true,
      reviewedAt: true,
    },
  },
} as const;

type ScoringItem = { id: string; points: number; isRequired: boolean };

@Injectable()
export class ChecklistsService {
  constructor(private readonly prisma: PrismaService) {}

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

  createChecklist(input: CreateChecklistInput, createdBy: string) {
    return this.prisma.checklist.create({
      data: { ...input, createdBy },
      select: checklistWithItemsSelect,
    });
  }

  async updateChecklist(checklistId: string, organizationId: string, input: UpdateChecklistInput) {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, organizationId, deletedAt: null },
      select: { id: true, scoringMode: true, scaleLevels: true },
    });

    if (!checklist) {
      throw new NotFoundException('Checklist not found');
    }

    if (input.status === 'published') {
      await this.ensurePublishable(checklistId, organizationId, input.scoringMode ?? checklist.scoringMode, input.scaleLevels ?? (checklist.scaleLevels as ScaleLevel[] | null));
    }

    const { scaleLevels, ...rest } = input;

    return this.prisma.checklist.update({
      where: { id: checklistId, organizationId },
      data: {
        ...rest,
        ...(scaleLevels !== undefined
          ? { scaleLevels: scaleLevels === null ? Prisma.JsonNull : scaleLevels }
          : {}),
      },
      select: checklistWithItemsSelect,
    });
  }

  async deleteChecklist(checklistId: string, organizationId: string) {
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
      select: { id: true, status: true },
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
      where: { checklistId, deletedAt: null },
      select: { id: true, points: true, isRequired: true },
    });

    return this.prisma.checklistInstance.create({
      data: {
        organizationId,
        checklistId,
        userId: input.userId,
        assignedBy,
        maxScore: this.computeMaxScore(items, await this.getScoringContext(checklistId, organizationId)),
        dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      },
      select: instanceSelect,
    });
  }

  listMyInstances(userId: string, organizationId: string) {
    return this.prisma.checklistInstance.findMany({
      where: { userId, organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: instanceWithResultsSelect,
    });
  }

  listInstancesForChecklist(checklistId: string, organizationId: string) {
    return this.prisma.checklistInstance.findMany({
      where: { checklistId, organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: instanceWithResultsSelect,
    });
  }

  listPendingReview(organizationId: string) {
    return this.prisma.checklistInstance.findMany({
      where: { organizationId, status: 'submitted', deletedAt: null },
      orderBy: { submittedAt: 'asc' },
      select: instanceWithResultsSelect,
    });
  }

  async getInstance(instanceId: string, organizationId: string) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { id: instanceId, organizationId, deletedAt: null },
      select: instanceWithResultsSelect,
    });

    if (!instance) {
      throw new NotFoundException('Checklist assignment not found');
    }

    return instance;
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
      select: { id: true, userId: true, status: true, checklistId: true },
    });

    if (!instance) {
      throw new NotFoundException('Checklist assignment not found');
    }

    if (instance.userId !== requesterId && !isPrivileged) {
      throw new ForbiddenException('You can only fill out your own checklist assignment');
    }

    if (instance.status === 'submitted' || instance.status === 'completed') {
      throw new BadRequestException('This checklist assignment is no longer editable');
    }

    const checklist = await this.prisma.checklist.findFirstOrThrow({
      where: { id: instance.checklistId },
      select: { scoringMode: true, scaleLevels: true, requiresReview: true },
    });

    const item = await this.prisma.checklistItem.findFirst({
      where: { id: itemId, checklistId: instance.checklistId, deletedAt: null },
      select: { id: true, points: true },
    });

    if (!item) {
      throw new NotFoundException('Checklist item not found');
    }

    const points = this.computeItemPoints(checklist.scoringMode, item.points, checklist.scaleLevels as ScaleLevel[] | null, input);

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

    return this.recomputeInstance(instanceId, organizationId);
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

    return this.recomputeInstance(instanceId, organizationId);
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

  private async getScoringContext(checklistId: string, organizationId: string) {
    return this.prisma.checklist.findFirstOrThrow({
      where: { id: checklistId, organizationId },
      select: { scoringMode: true, scaleLevels: true },
    });
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

  private async recomputeInstance(instanceId: string, organizationId: string) {
    const instance = await this.prisma.checklistInstance.findFirstOrThrow({
      where: { id: instanceId, organizationId },
      select: { checklistId: true, status: true },
    });

    const [checklist, items, results] = await Promise.all([
      this.prisma.checklist.findFirstOrThrow({
        where: { id: instance.checklistId },
        select: { passThreshold: true, requiresReview: true },
      }),
      this.prisma.checklistItem.findMany({ where: { checklistId: instance.checklistId, deletedAt: null }, select: { id: true } }),
      this.prisma.checklistItemResult.findMany({ where: { instanceId }, select: { itemId: true, points: true, reviewStatus: true } }),
    ]);

    const totalScore = results.reduce((sum, result) => sum + (result.reviewStatus === 'rejected' ? 0 : result.points), 0);
    const allAnswered = items.length > 0 && items.every((item) => results.some((result) => result.itemId === item.id));
    const allReviewed = results.length > 0 && results.every((result) => result.reviewStatus !== 'pending');

    let status = instance.status;
    let submittedAt: Date | undefined;
    let completedAt: Date | undefined;

    if (allAnswered && checklist.requiresReview && status !== 'submitted' && status !== 'completed') {
      status = 'submitted';
      submittedAt = new Date();
    } else if (allAnswered && checklist.requiresReview && status === 'submitted' && allReviewed) {
      status = 'completed';
      completedAt = new Date();
    } else if (allAnswered && !checklist.requiresReview) {
      status = 'completed';
      completedAt = new Date();
    } else if (!allAnswered && status === 'assigned') {
      status = 'in_progress';
    }

    // Recompute maxScore from the live scoring context so a later item edit stays accurate.
    const scoringContext = await this.getScoringContext(instance.checklistId, organizationId);
    const itemPointsList = await this.prisma.checklistItem.findMany({
      where: { checklistId: instance.checklistId, deletedAt: null },
      select: { id: true, points: true, isRequired: true },
    });
    const maxScore = this.computeMaxScore(itemPointsList, scoringContext);
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const passed = status === 'completed' && percentage >= checklist.passThreshold;

    return this.prisma.checklistInstance.update({
      where: { id: instanceId },
      data: {
        status,
        totalScore,
        maxScore,
        percentage,
        passed,
        ...(submittedAt ? { submittedAt } : {}),
        ...(completedAt ? { completedAt } : {}),
      },
      select: instanceWithResultsSelect,
    });
  }
}
