import { NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { UploadService } from '../upload/public.js';
import { ChecklistsService } from './checklists.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const checklistId = '22222222-2222-2222-2222-222222222222';
const instanceId = '55555555-5555-5555-5555-555555555555';
const itemAId = '66666666-6666-6666-6666-666666666666';
const itemBId = '77777777-7777-7777-7777-777777777777';

const snapshot = {
  version: 1,
  checklist: {
    id: checklistId,
    organizationId,
    title: 'Opening shift checklist',
    description: null,
    status: 'published',
    scoringMode: 'sum_points',
    passThreshold: 80,
    scaleLevels: null,
    requiresReview: false,
    items: [
      { id: itemAId, checklistId, order: 0, text: 'Item A', points: 10, isRequired: true, photoRequired: false },
      { id: itemBId, checklistId, order: 1, text: 'Item B', points: 10, isRequired: true, photoRequired: false },
    ],
  },
};

function createService(prisma: object) {
  return new ChecklistsService(prisma as PrismaService, {} as UploadService);
}

function instanceRow(overrides: Record<string, unknown> = {}) {
  return { checklistId, templateSnapshot: snapshot, snapshotVersion: 1, ...overrides };
}

describe('ChecklistsService.computeInstanceScore (PR 300)', () => {
  it('computes score purely from persisted results + the immutable snapshot, ignoring live checklist edits', async () => {
    const prisma = {
      checklistInstance: { findFirst: jest.fn(async () => instanceRow()) },
      checklistItemResult: {
        findMany: jest.fn(async () => [
          { itemId: itemAId, checked: true, scaleLevel: null, points: 10, photoObjectKey: null, reviewStatus: 'approved', answerState: 'answered' },
          { itemId: itemBId, checked: false, scaleLevel: null, points: 0, photoObjectKey: null, reviewStatus: 'pending', answerState: 'answered' },
        ]),
      },
    };
    const service = createService(prisma);

    const result = await service.computeInstanceScore(instanceId, organizationId);

    expect(result).toEqual({ totalScore: 10, maxScore: 20, scored: true, percentage: 50, passThreshold: 80 });
    expect(prisma.checklistInstance.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: instanceId, organizationId, deletedAt: null },
    }));
  });

  it('reads through the provided transaction client instead of the default prisma instance', async () => {
    const defaultFindFirst = jest.fn(async () => null);
    const prisma = { checklistInstance: { findFirst: defaultFindFirst } };
    const txFindFirst = jest.fn(async () => instanceRow());
    const txFindMany = jest.fn(async () => []);
    const tx = { checklistInstance: { findFirst: txFindFirst }, checklistItemResult: { findMany: txFindMany } };
    const service = createService(prisma);

    const result = await service.computeInstanceScore(instanceId, organizationId, tx as never);

    expect(result).toMatchObject({ totalScore: 0, maxScore: 20, scored: true, percentage: 0 }); // no results yet -> nothing earned
    expect(defaultFindFirst).not.toHaveBeenCalled();
    expect(txFindFirst).toHaveBeenCalledTimes(1);
  });

  it('rejects an instance that does not exist in this tenant', async () => {
    const prisma = { checklistInstance: { findFirst: jest.fn(async () => null) } };
    const service = createService(prisma);

    await expect(service.computeInstanceScore(instanceId, organizationId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports scored=false and percentage 0 when every item is skipped', async () => {
    const prisma = {
      checklistInstance: { findFirst: jest.fn(async () => instanceRow()) },
      checklistItemResult: {
        findMany: jest.fn(async () => [
          { itemId: itemAId, checked: false, scaleLevel: null, points: 0, photoObjectKey: null, reviewStatus: 'pending', answerState: 'skipped' },
          { itemId: itemBId, checked: false, scaleLevel: null, points: 0, photoObjectKey: null, reviewStatus: 'pending', answerState: 'skipped' },
        ]),
      },
    };
    const service = createService(prisma);

    const result = await service.computeInstanceScore(instanceId, organizationId);

    expect(result).toMatchObject({ totalScore: 0, maxScore: 0, scored: false, percentage: 0 });
  });
});
