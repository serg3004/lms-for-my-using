import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { ChecklistsService } from './checklists.service.js';
import { bulkAssignChecklistSchema, MAX_BULK_CHECKLIST_TARGETS } from './checklists.schemas.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const actorId = '22222222-2222-2222-2222-222222222222';
const userA = '33333333-3333-3333-3333-333333333333';
const userB = '44444444-4444-4444-4444-444444444444';
const groupId = '55555555-5555-5555-5555-555555555555';

const checklist = {
  id: 'checklist-1', organizationId, title: 'Safety', description: null, status: 'published',
  scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false,
  createdBy: actorId, createdAt: new Date(), updatedAt: new Date(),
};
const item = { id: 'item-1', checklistId: checklist.id, order: 0, text: 'Helmet', points: 10, isRequired: true, photoRequired: false };

function createPrisma(options: { activeUserIds?: string[]; groupIds?: string[]; managedGroupIds?: string[] } = {}) {
  const createMany = jest.fn(async () => ({ count: 1 }));
  const transactionClient = {
    checklistInstance: {
      findMany: jest.fn(async () => (options.activeUserIds ?? []).map((userId) => ({ userId }))),
      createMany,
    },
  };
  const prisma = {
    checklist: { findFirst: jest.fn(async () => checklist) },
    managerGroup: { findMany: jest.fn(async () => (options.managedGroupIds ?? []).map((managedId) => ({ groupId: managedId }))) },
    group: { findMany: jest.fn(async () => (options.groupIds ?? [groupId]).map((id) => ({ id }))) },
    groupMember: { findMany: jest.fn(async () => [{ userId: userA, groupId }, { userId: userB, groupId }]) },
    user: { findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id }))) },
    checklistItem: { findMany: jest.fn(async () => [item]) },
    $transaction: jest.fn(async (callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient)),
  };
  return { prisma: prisma as unknown as PrismaService, createMany, transaction: prisma.$transaction };
}

describe('checklist bulk assignment', () => {
  it('deduplicates overlapping targets, skips active recipients and applies one deadline', async () => {
    const { prisma, createMany } = createPrisma({ activeUserIds: [userB] });
    const service = new ChecklistsService(prisma);
    const dueAt = '2026-09-01T10:00:00.000Z';

    const result = await service.bulkAssignChecklist(checklist.id, organizationId, {
      targets: [{ type: 'user', id: userA }, { type: 'group', id: groupId }, { type: 'user', id: userA }], dueAt,
    }, actorId, ['admin']);

    expect(result).toEqual({ created: 1, skippedActive: 1, resolvedRecipients: 2, recipientCount: 2 });
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ userId: userA, dueAt: new Date(dueAt), maxScore: 10 })] });
  });

  it('rejects a manager targeting a group outside their managed scope before writing', async () => {
    const { prisma, transaction } = createPrisma({ managedGroupIds: [] });
    const service = new ChecklistsService(prisma);
    await expect(service.bulkAssignChecklist(checklist.id, organizationId, {
      targets: [{ type: 'group', id: groupId }],
    }, actorId, ['manager'])).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects invalid groups before opening the assignment transaction', async () => {
    const { prisma, transaction } = createPrisma({ groupIds: [] });
    const service = new ChecklistsService(prisma);
    await expect(service.bulkAssignChecklist(checklist.id, organizationId, {
      targets: [{ type: 'group', id: groupId }],
    }, actorId, ['admin'])).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('bounds target descriptors at the request boundary', () => {
    const targets = Array.from({ length: MAX_BULK_CHECKLIST_TARGETS + 1 }, () => ({ type: 'manager_team' as const }));
    expect(bulkAssignChecklistSchema.safeParse({ targets }).success).toBe(false);
  });
});
