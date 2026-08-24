import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { UploadService } from '../upload/public.js';
import { ChecklistsService } from './checklists.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const checklistId = '22222222-2222-2222-2222-222222222222';
const instanceId = '33333333-3333-3333-3333-333333333333';
const userId = '44444444-4444-4444-4444-444444444444';
const reviewerId = '55555555-5555-5555-5555-555555555555';

type TestItem = {
  id: string;
  points: number;
  isRequired: boolean;
  photoRequired: boolean;
};

type TestResult = {
  id: string;
  organizationId: string;
  instanceId: string;
  itemId: string;
  checked: boolean;
  scaleLevel: number | null;
  points: number;
  photoUrl: string | null;
  photoObjectKey: string | null;
  photoFileName: string | null;
  photoMimeType: string | null;
  photoSizeBytes: number | null;
  comment: string | null;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewComment: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
};

type ResultKey = { instanceId_itemId: { instanceId: string; itemId: string } };
type ResultWrite = {
  itemId: string;
  checked?: boolean;
  scaleLevel?: number | null;
  points: number;
  photoUrl?: string | null;
  comment?: string | null;
};
type ResultPatch = Partial<Omit<TestResult, 'reviewStatus'>> & { reviewStatus?: TestResult['reviewStatus'] };
type InstancePatch = {
  status?: string;
  totalScore?: number;
  maxScore?: number;
  percentage?: number;
  passed?: boolean;
  submittedAt?: Date;
  completedAt?: Date;
};

function createHarness({
  items,
  scoringMode = 'sum_points',
  requiresReview = false,
}: {
  items: TestItem[];
  scoringMode?: 'sum_points' | 'all_required' | 'scale';
  requiresReview?: boolean;
}) {
  const scaleLevels = scoringMode === 'scale'
    ? [
        { level: 1, label: 'Low', points: 0 },
        { level: 2, label: 'High', points: 10 },
      ]
    : null;
  const checklist = { passThreshold: 0, requiresReview, scoringMode, scaleLevels };
  const instance = {
    id: instanceId,
    organizationId,
    checklistId,
    userId,
    assignedBy: reviewerId,
    status: 'assigned',
    totalScore: 0,
    maxScore: 0,
    percentage: 0,
    passed: false,
    dueAt: null,
    submittedAt: null as Date | null,
    completedAt: null as Date | null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    updatedAt: new Date('2026-08-23T00:00:00.000Z'),
  };
  const results: TestResult[] = [];

  function resultFor(itemId: string) {
    return results.find((candidate) => candidate.itemId === itemId);
  }

  const checklistItemResult = {
    upsert: jest.fn(async ({ where, create, update }: { where: ResultKey; create: ResultWrite; update: ResultPatch }) => {
      const current = resultFor(where.instanceId_itemId.itemId);
      if (current) {
        Object.assign(current, update);
        return current;
      }
      const created: TestResult = {
        id: `result-${results.length + 1}`,
        organizationId,
        instanceId,
        itemId: create.itemId,
        checked: create.checked ?? false,
        scaleLevel: create.scaleLevel ?? null,
        points: create.points,
        photoUrl: create.photoUrl ?? null,
        photoObjectKey: null,
        photoFileName: null,
        photoMimeType: null,
        photoSizeBytes: null,
        comment: create.comment ?? null,
        reviewStatus: 'pending',
        reviewComment: null,
        reviewedBy: null,
        reviewedAt: null,
      };
      results.push(created);
      return created;
    }),
    findMany: jest.fn(async () => results),
    findUnique: jest.fn(async ({ where }: { where: ResultKey }) => resultFor(where.instanceId_itemId.itemId) ?? null),
    update: jest.fn(async ({ where, data }: { where: ResultKey; data: ResultPatch }) => {
      const current = resultFor(where.instanceId_itemId.itemId);
      if (!current) throw new Error('Missing test result');
      Object.assign(current, data);
      return current;
    }),
  };

  const prisma = {
    checklistInstance: {
      findFirst: jest.fn(async () => ({ ...instance })),
      findFirstOrThrow: jest.fn(async () => ({ checklistId, status: instance.status })),
      update: jest.fn(async ({ data }: { data: InstancePatch }) => {
        Object.assign(instance, data, { updatedAt: new Date() });
        return { ...instance, checklist: { ...checklist, items }, results: results.map((entry) => ({ ...entry })) };
      }),
    },
    checklist: {
      findFirstOrThrow: jest.fn(async () => ({ ...checklist })),
    },
    checklistItem: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => items.find((candidate) => candidate.id === where.id) ?? null),
      findMany: jest.fn(async () => items),
    },
    checklistItemResult,
    checklistInstanceEvent: { createMany: jest.fn(async () => ({ count: 1 })) },
  } as unknown as PrismaService;

  const uploadService = {
    deleteObject: jest.fn(async () => undefined),
  } as unknown as UploadService;

  return {
    instance,
    results,
    service: new ChecklistsService(prisma, uploadService),
  };
}

describe('ChecklistsService completion correctness', () => {
  it('requires checked=true before a required checkbox item can complete the instance', async () => {
    const { service } = createHarness({
      items: [{ id: 'required', points: 10, isRequired: true, photoRequired: false }],
    });

    const unchecked = await service.submitItemResult(instanceId, 'required', organizationId, userId, false, { checked: false });
    expect(unchecked.status).toBe('in_progress');

    const checked = await service.submitItemResult(instanceId, 'required', organizationId, userId, false, { checked: true });
    expect(checked.status).toBe('completed');
  });

  it('allows an optional item to be skipped without blocking required completion', async () => {
    const { service } = createHarness({
      items: [
        { id: 'required', points: 10, isRequired: true, photoRequired: false },
        { id: 'optional', points: 5, isRequired: false, photoRequired: false },
      ],
    });

    const completed = await service.submitItemResult(instanceId, 'required', organizationId, userId, false, { checked: true });

    expect(completed.status).toBe('completed');
    expect(completed.totalScore).toBe(10);
    expect(completed.maxScore).toBe(15);
  });

  it('keeps the last required photo item in progress until object-backed evidence is attached', async () => {
    const { service, results } = createHarness({
      items: [{ id: 'photo-required', points: 10, isRequired: true, photoRequired: true }],
    });

    const answered = await service.submitItemResult(instanceId, 'photo-required', organizationId, userId, false, { checked: true });
    expect(answered.status).toBe('in_progress');
    expect(results[0]?.photoObjectKey).toBeNull();

    const completed = await service.attachItemPhoto(
      instanceId,
      'photo-required',
      organizationId,
      userId,
      false,
      { objectKey: 'checklists/evidence.jpg', fileName: 'evidence.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 },
    );

    expect(completed.status).toBe('completed');
    expect(results[0]?.photoObjectKey).toBe('checklists/evidence.jpg');
  });

  it('requires photo evidence when an optional item is answered before required completion', async () => {
    const { service } = createHarness({
      items: [
        { id: 'optional-photo', points: 5, isRequired: false, photoRequired: true },
        { id: 'required', points: 10, isRequired: true, photoRequired: false },
      ],
    });

    await service.submitItemResult(instanceId, 'optional-photo', organizationId, userId, false, { checked: true });
    const requiredAnswered = await service.submitItemResult(instanceId, 'required', organizationId, userId, false, { checked: true });
    expect(requiredAnswered.status).toBe('in_progress');

    const completed = await service.attachItemPhoto(
      instanceId,
      'optional-photo',
      organizationId,
      userId,
      false,
      { objectKey: 'checklists/optional.jpg', fileName: 'optional.jpg', mimeType: 'image/jpeg', sizeBytes: 512 },
    );
    expect(completed.status).toBe('completed');
  });

  it('submits for review only after required evidence exists, then completes after review', async () => {
    const { service } = createHarness({
      items: [{ id: 'review-photo', points: 10, isRequired: true, photoRequired: true }],
      requiresReview: true,
    });

    const answered = await service.submitItemResult(instanceId, 'review-photo', organizationId, userId, false, { checked: true });
    expect(answered.status).toBe('in_progress');

    const submitted = await service.attachItemPhoto(
      instanceId,
      'review-photo',
      organizationId,
      userId,
      false,
      { objectKey: 'checklists/review.jpg', fileName: 'review.jpg', mimeType: 'image/jpeg', sizeBytes: 2048 },
    );
    expect(submitted.status).toBe('submitted');

    const completed = await service.reviewItemResult(instanceId, 'review-photo', organizationId, reviewerId, { status: 'approved' });
    expect(completed.status).toBe('completed');
  });

  it('completes a required scale item only after a scale level is selected', async () => {
    const { service } = createHarness({
      items: [{ id: 'scale-required', points: 10, isRequired: true, photoRequired: false }],
      scoringMode: 'scale',
    });

    const completed = await service.submitItemResult(instanceId, 'scale-required', organizationId, userId, false, { scaleLevel: 2 });

    expect(completed.status).toBe('completed');
    expect(completed.totalScore).toBe(10);
  });
});
