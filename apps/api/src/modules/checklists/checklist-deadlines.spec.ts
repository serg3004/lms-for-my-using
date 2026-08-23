import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { BackgroundJobsService } from '../background-jobs/background-jobs.service.js';
import {
  ACTIVE_CHECKLIST_INSTANCE_STATUSES,
  expireDueChecklistBatch,
  isChecklistDeadlineReached,
} from './checklist-deadlines.js';
import {
  CHECKLIST_DEADLINE_BATCH_SIZE,
  CHECKLIST_DEADLINE_INTERVAL_MS,
  CHECKLIST_DEADLINE_JOB,
  CHECKLIST_DEADLINE_SCHEDULER,
  ChecklistDeadlineWorker,
} from './checklist-deadline.worker.js';

describe('checklist deadline lifecycle', () => {
  const now = new Date('2026-08-23T12:00:00.000Z');

  it('treats only dueAt <= now as reached and leaves null deadlines open', () => {
    expect(isChecklistDeadlineReached(new Date('2026-08-23T12:00:00.001Z'), now)).toBe(false);
    expect(isChecklistDeadlineReached(new Date('2026-08-23T12:00:00.000Z'), now)).toBe(true);
    expect(isChecklistDeadlineReached(new Date('2026-08-23T11:59:59.999Z'), now)).toBe(true);
    expect(isChecklistDeadlineReached(null, now)).toBe(false);
  });

  it('expires selected active rows with explicit tenant isolation and can be repeated safely', async () => {
    const findMany = jest
      .fn<() => Promise<Array<{ id: string; organizationId: string }>>>()
      .mockResolvedValueOnce([
        { id: 'instance-a', organizationId: 'org-a' },
        { id: 'instance-b', organizationId: 'org-b' },
      ])
      .mockResolvedValueOnce([]);
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const prisma = { checklistInstance: { findMany, updateMany } } as unknown as PrismaService;

    await expect(expireDueChecklistBatch(prisma, now, 10)).resolves.toEqual({ selected: 2, expired: 2 });
    await expect(expireDueChecklistBatch(prisma, now, 10)).resolves.toEqual({ selected: 0, expired: 0 });

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        deletedAt: null,
        status: { in: [...ACTIVE_CHECKLIST_INSTANCE_STATUSES] },
        dueAt: { lte: now },
      },
      take: 10,
    });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-a', id: { in: ['instance-a'] } }),
      data: { status: 'expired' },
    }));
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-b', id: { in: ['instance-b'] } }),
      data: { status: 'expired' },
    }));
  });

  it('registers the batch handler and recurring BullMQ schedule in the existing background job service', () => {
    const registerHandler = jest.fn();
    const registerRecurring = jest.fn();
    const jobs = { registerHandler, registerRecurring } as unknown as BackgroundJobsService;
    const prisma = {} as PrismaService;
    const worker = new ChecklistDeadlineWorker(prisma, jobs);

    worker.onModuleInit();

    expect(registerHandler).toHaveBeenCalledWith(CHECKLIST_DEADLINE_JOB, expect.any(Function));
    expect(registerRecurring).toHaveBeenCalledWith(CHECKLIST_DEADLINE_JOB, {}, {
      schedulerId: CHECKLIST_DEADLINE_SCHEDULER,
      everyMs: CHECKLIST_DEADLINE_INTERVAL_MS,
      attempts: 3,
      backoffMs: 1_000,
    });
    expect(CHECKLIST_DEADLINE_BATCH_SIZE).toBe(500);
  });
});
