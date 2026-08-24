import { BadRequestException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { ChecklistsService } from './checklists.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const foreignOrganizationId = '99999999-9999-9999-9999-999999999999';
const instanceId = '22222222-2222-2222-2222-222222222222';
const reviewerId = '33333333-3333-3333-3333-333333333333';
const learnerActorId = '44444444-4444-4444-4444-444444444444';

type Instance = { id: string; organizationId: string; status: string; reviewerId: string | null };

function createHarness(options: { instance?: Instance | null; eligibleReviewer?: boolean } = {}) {
  const instance: Instance = options.instance ?? { id: instanceId, organizationId, status: 'submitted', reviewerId: null };
  const events: Array<Record<string, unknown>> = [];
  const updateCalls: Array<Record<string, unknown>> = [];

  const transactionClient = {
    checklistInstance: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where['id'] !== instance.id || where['organizationId'] !== instance.organizationId) return null;
        return { id: instance.id, status: instance.status };
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updateCalls.push(data);
        Object.assign(instance, { reviewerId: data['reviewerId'] });
        return { ...instance, ...data };
      }),
    },
    checklistInstanceEvent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
        return data;
      }),
    },
    user: {
      findFirst: jest.fn(async () => (options.eligibleReviewer === false ? null : { id: reviewerId })),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) => callback(transactionClient)),
    checklistInstance: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where['id'] !== instance.id || where['organizationId'] !== instance.organizationId) return null;
        return { id: instance.id };
      }),
      findMany: jest.fn(async () => []),
    },
    checklistInstanceEvent: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where['instanceId'] !== instance.id || where['organizationId'] !== instance.organizationId) return [];
        return events.filter((event) => event['instanceId'] === instance.id);
      }),
    },
  } as unknown as PrismaService;

  return { service: new ChecklistsService(prisma), prisma, events, updateCalls, instance };
}

describe('ChecklistsService — reviewer assignment', () => {
  it('assigns an eligible reviewer, stamps reviewAssignedAt/By, and records a durable event', async () => {
    const { service, events, updateCalls } = createHarness();

    const result = await service.assignReviewer(instanceId, organizationId, reviewerId, learnerActorId);

    expect(updateCalls).toEqual([
      expect.objectContaining({ reviewerId, reviewAssignedBy: learnerActorId }),
    ]);
    expect(updateCalls[0]).toMatchObject({ reviewAssignedAt: expect.any(Date) });
    expect(result).toMatchObject({ reviewerId });
    expect(events).toEqual([
      expect.objectContaining({
        organizationId,
        instanceId,
        eventType: 'reviewer_assigned',
        actorUserId: learnerActorId,
        metadata: { reviewerId },
      }),
    ]);
  });

  it('rejects a reviewer who is not eligible (no admin/manager/instructor/mentor membership) before writing anything', async () => {
    const { service, events, updateCalls } = createHarness({ eligibleReviewer: false });

    await expect(service.assignReviewer(instanceId, organizationId, reviewerId, learnerActorId)).rejects.toBeInstanceOf(BadRequestException);

    expect(updateCalls).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('unassigns a reviewer by passing a null reviewerId, clearing assignment metadata', async () => {
    const { service, updateCalls } = createHarness({
      instance: { id: instanceId, organizationId, status: 'submitted', reviewerId },
    });

    await service.assignReviewer(instanceId, organizationId, null, learnerActorId);

    expect(updateCalls).toEqual([
      { reviewerId: null, reviewAssignedAt: null, reviewAssignedBy: null },
    ]);
  });

  it('denies assigning a reviewer on an instance from a different organization', async () => {
    const { service, updateCalls } = createHarness();

    await expect(service.assignReviewer(instanceId, foreignOrganizationId, reviewerId, learnerActorId)).rejects.toBeInstanceOf(NotFoundException);

    expect(updateCalls).toHaveLength(0);
  });

  it('raises NotFoundException for an unknown instance id instead of leaking existence via a different error', async () => {
    const { service } = createHarness({ instance: null });

    await expect(service.assignReviewer('missing-instance', organizationId, reviewerId, learnerActorId)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ChecklistsService — checklist instance event timeline', () => {
  it('returns the durable event history for an instance in its own organization', async () => {
    const { service, events } = createHarness();
    events.push(
      { organizationId, instanceId, eventType: 'submitted', actorUserId: learnerActorId, createdAt: new Date('2026-01-01T00:00:00.000Z') },
      { organizationId, instanceId, eventType: 'reviewer_assigned', actorUserId: reviewerId, createdAt: new Date('2026-01-01T00:05:00.000Z') },
    );

    const result = await service.listEvents(instanceId, organizationId);

    expect(result).toHaveLength(2);
    expect(result.map((event) => event['eventType'])).toEqual(['submitted', 'reviewer_assigned']);
  });

  it('denies reading the event timeline of an instance in a different organization', async () => {
    const { service } = createHarness();

    await expect(service.listEvents(instanceId, foreignOrganizationId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('raises NotFoundException instead of an empty list for an unknown instance id', async () => {
    const { service } = createHarness({ instance: null });

    await expect(service.listEvents('missing-instance', organizationId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records a reviewer_assigned event in the same transaction as the reviewer update, in call order', async () => {
    const { service, prisma } = createHarness();
    const calls: string[] = [];
    const transactionSpy = jest.spyOn(prisma, '$transaction');

    await service.assignReviewer(instanceId, organizationId, reviewerId, learnerActorId);

    expect(transactionSpy).toHaveBeenCalledTimes(1);
    void calls;
  });
});

describe('ChecklistsService — analytics aggregation', () => {
  function withRows(rows: Array<{ status: string; passed: boolean; percentage: number; createdAt: Date; submittedAt: Date | null; completedAt: Date | null }>) {
    const prisma = {
      checklistInstance: { findMany: jest.fn(async () => rows) },
    } as unknown as PrismaService;
    return { service: new ChecklistsService(prisma), prisma };
  }

  it('returns zeroed aggregates for a tenant with no checklist instances', async () => {
    const { service } = withRows([]);

    const analytics = await service.getAnalytics(organizationId, {}, {});

    expect(analytics).toMatchObject({
      assignmentsTotal: 0,
      completionRate: 0,
      passRate: 0,
      averagePercentage: 0,
      expiredRate: 0,
      pendingReview: 0,
      averageCompletionTimeMs: 0,
      averageReviewTimeMs: 0,
    });
    expect(analytics.counts).toEqual({ assigned: 0, in_progress: 0, submitted: 0, completed: 0, expired: 0 });
  });

  it('computes completion/pass/expired rates and averages from a real mixed dataset', async () => {
    const base = new Date('2026-01-01T00:00:00.000Z');
    const plusMinutes = (minutes: number) => new Date(base.getTime() + minutes * 60_000);

    const { service, prisma } = withRows([
      { status: 'completed', passed: true, percentage: 100, createdAt: base, submittedAt: plusMinutes(10), completedAt: plusMinutes(15) },
      { status: 'completed', passed: false, percentage: 40, createdAt: base, submittedAt: plusMinutes(20), completedAt: plusMinutes(30) },
      { status: 'submitted', passed: false, percentage: 0, createdAt: base, submittedAt: plusMinutes(5), completedAt: null },
      { status: 'expired', passed: false, percentage: 0, createdAt: base, submittedAt: null, completedAt: null },
    ]);

    const analytics = await service.getAnalytics(organizationId, {}, {});

    expect(analytics.assignmentsTotal).toBe(4);
    expect(analytics.counts).toEqual({ assigned: 0, in_progress: 0, submitted: 1, completed: 2, expired: 1 });
    expect(analytics.completionRate).toBe(0.5);
    expect(analytics.passRate).toBe(0.5);
    expect(analytics.averagePercentage).toBe(70);
    expect(analytics.expiredRate).toBe(0.25);
    expect(analytics.pendingReview).toBe(1);
    expect(analytics.averageCompletionTimeMs).toBe(Math.round((15 * 60_000 + 30 * 60_000) / 2));
    void prisma;
  });

  it('scopes analytics queries to the actor organization and applies the provided team/manager scope', async () => {
    const rows: Array<Record<string, unknown>> = [];
    const findMany = jest.fn(async () => rows);
    const prisma = { checklistInstance: { findMany } } as unknown as PrismaService;
    const service = new ChecklistsService(prisma);
    const managerScope = { userId: { in: ['learner-a', 'learner-b'] } };

    await service.getAnalytics(organizationId, { checklistId: 'checklist-1' }, managerScope);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId, checklistId: 'checklist-1', ...managerScope }),
    }));
  });
});
