import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { UploadService } from '../upload/public.js';
import { ChecklistsService } from './checklists.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const checklistId = '22222222-2222-2222-2222-222222222222';
const userId = '33333333-3333-3333-3333-333333333333';
const assignerId = '44444444-4444-4444-4444-444444444444';
const instanceId = '55555555-5555-5555-5555-555555555555';
const itemId = '66666666-6666-6666-6666-666666666666';

const assignedChecklist = {
  id: checklistId,
  organizationId,
  title: 'Original checklist',
  description: 'Original description',
  status: 'published' as const,
  scoringMode: 'sum_points' as const,
  passThreshold: 80,
  scaleLevels: null,
  requiresReview: false,
  createdBy: assignerId,
  createdAt: new Date('2026-08-23T00:00:00.000Z'),
  updatedAt: new Date('2026-08-23T00:00:00.000Z'),
};

const assignedItem = {
  id: itemId,
  checklistId,
  order: 0,
  text: 'Original item',
  points: 10,
  isRequired: true,
  photoRequired: false,
};

const liveChecklistWithItems = {
  ...assignedChecklist,
  items: [assignedItem],
};

function createService(prisma: object) {
  return new ChecklistsService(prisma as PrismaService, {} as UploadService);
}

function instanceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: instanceId,
    organizationId,
    checklistId,
    userId,
    assignedBy: assignerId,
    status: 'assigned',
    totalScore: 0,
    maxScore: 10,
    percentage: 0,
    passed: false,
    dueAt: null,
    submittedAt: null,
    completedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    updatedAt: new Date('2026-08-23T00:00:00.000Z'),
    checklist: liveChecklistWithItems,
    results: [],
    ...overrides,
  };
}

const snapshot = {
  version: 1,
  checklist: {
    id: checklistId,
    organizationId,
    title: assignedChecklist.title,
    description: assignedChecklist.description,
    status: assignedChecklist.status,
    scoringMode: assignedChecklist.scoringMode,
    passThreshold: assignedChecklist.passThreshold,
    scaleLevels: assignedChecklist.scaleLevels,
    requiresReview: assignedChecklist.requiresReview,
    items: [assignedItem],
  },
};

describe('ChecklistsService immutable assignment snapshots', () => {
  it('persists the published template and item configuration when assigning a checklist', async () => {
    const createInstance = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...instanceRecord(),
      maxScore: data.maxScore,
    }));
    const prisma = {
      checklist: { findFirst: jest.fn(async () => liveChecklistWithItems) },
      checklistItem: { findMany: jest.fn(async () => [assignedItem]) },
      user: { findFirst: jest.fn(async () => ({ id: userId })) },
      checklistInstance: {
        findFirst: jest.fn(async () => null),
        create: createInstance,
      },
      checklistInstanceEvent: { create: jest.fn(async () => ({ id: 'event-id' })) },
    };
    Object.assign(prisma, { $transaction: async (operation: (transaction: typeof prisma) => unknown) => operation(prisma) });
    const service = createService(prisma);

    await service.assignChecklist(checklistId, organizationId, { userId }, assignerId);

    expect(createInstance).toHaveBeenCalledTimes(1);
    expect(createInstance.mock.calls[0]?.[0].data).toMatchObject({
      maxScore: 10,
      snapshotVersion: 1,
      templateSnapshot: snapshot,
    });
  });

  it('presents the assignment snapshot instead of later live-template changes', async () => {
    const prisma = {
      checklistInstance: {
        findFirst: jest.fn(async () => instanceRecord({
          templateSnapshot: snapshot,
          snapshotVersion: 1,
          checklist: {
            ...liveChecklistWithItems,
            title: 'Changed checklist',
            description: 'Changed description',
            passThreshold: 95,
            items: [{ ...assignedItem, text: 'Changed item', points: 100 }],
          },
        })),
      },
    };
    const service = createService(prisma);

    const instance = await service.getInstance(instanceId, organizationId);

    expect(instance.checklist).toMatchObject({
      title: 'Original checklist',
      description: 'Original description',
      passThreshold: 80,
      items: [expect.objectContaining({ text: 'Original item', points: 10 })],
    });
  });

  it('keeps a null snapshot compatible with the live-template legacy fallback', async () => {
    const prisma = {
      checklistInstance: {
        findFirst: jest.fn(async () => instanceRecord({
          templateSnapshot: null,
          snapshotVersion: 1,
        })),
      },
    };
    const service = createService(prisma);

    const instance = await service.getInstance(instanceId, organizationId);

    expect(instance.checklist).toMatchObject({ title: 'Original checklist', items: [assignedItem] });
  });

  it('fails closed for an unsupported non-null snapshot version', async () => {
    const prisma = {
      checklistInstance: {
        findFirst: jest.fn(async () => instanceRecord({
          templateSnapshot: snapshot,
          snapshotVersion: 2,
        })),
      },
    };
    const service = createService(prisma);

    await expect(service.getInstance(instanceId, organizationId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails closed for malformed non-null snapshot data', async () => {
    const prisma = {
      checklistInstance: {
        findFirst: jest.fn(async () => instanceRecord({
          templateSnapshot: { version: 1, checklist: { title: 'Incomplete' } },
          snapshotVersion: 1,
        })),
      },
    };
    const service = createService(prisma);

    await expect(service.getInstance(instanceId, organizationId)).rejects.toBeInstanceOf(BadRequestException);
  });
});
