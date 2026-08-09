import type { Prisma } from '@prisma/client';
import { jest } from '@jest/globals';

import type { PrismaService } from '../../database/prisma.service.js';
import type { BackgroundJobsService } from '../background-jobs/public.js';
import { OutboxService } from './outbox.service.js';

type StoredEvent = { id: string; topic: string; payload: Prisma.JsonObject; created_at: Date; publishedAt: Date | null };

function createHarness() {
  const events: StoredEvent[] = [];
  let failUpdateOnce = false;
  const enqueue = jest.fn(async () => ({ id: 'job-id', deduplicated: false }));
  const transaction = {
    outboxEvent: {
      create: jest.fn(async ({ data }: { data: { topic: string; payload: Prisma.JsonObject } }) => {
        events.push({ id: `event-${events.length + 1}`, ...data, created_at: new Date(), publishedAt: null });
      }),
      update: jest.fn(async ({ where }: { where: { id: string } }) => {
        if (failUpdateOnce) {
          failUpdateOnce = false;
          throw new Error('simulated crash after enqueue');
        }
        const event = events.find(({ id }) => id === where.id);
        if (event) event.publishedAt = new Date();
      }),
    },
    $queryRaw: jest.fn(async () => events
      .filter(({ publishedAt }) => publishedAt === null)
      .map(({ id, topic, payload, created_at }) => ({ id, topic, payload, created_at }))
      .slice(0, 1)),
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof transaction) => Promise<unknown>) => {
      const snapshot = events.map((event) => ({ ...event }));
      try {
        return await callback(transaction);
      } catch (error) {
        events.splice(0, events.length, ...snapshot);
        throw error;
      }
    }),
    outboxEvent: {
      count: jest.fn(async () => events.filter(({ publishedAt }) => publishedAt === null).length),
      findFirst: jest.fn(async () => {
        const event = events.find(({ publishedAt }) => publishedAt === null);
        return event ? { createdAt: event.created_at } : null;
      }),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
  };
  const service = new OutboxService(
    prisma as unknown as PrismaService,
    { enqueue } as unknown as BackgroundJobsService,
  );
  return { service, events, enqueue, crashAfterEnqueue: () => { failUpdateOnce = true; } };
}

describe('OutboxService', () => {
  it('writes a business mutation and its event through the same transaction client', async () => {
    const { service, events } = createHarness();
    let mutationApplied = false;

    await service.runInTransaction(async (_transaction, emit) => {
      mutationApplied = true;
      await emit({ topic: 'certificate.issue', payload: { certificateId: 'certificate-1' } });
    });

    expect(mutationApplied).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ topic: 'certificate.issue', publishedAt: null });
  });

  it('does not retain an event when its business transaction rolls back', async () => {
    const { service, events } = createHarness();

    await expect(service.runInTransaction(async (_transaction, emit) => {
      await emit({ topic: 'course.publish', payload: { courseId: 'course-1' } });
      throw new Error('business mutation failed');
    })).rejects.toThrow('business mutation failed');

    expect(events).toHaveLength(0);
  });

  it('retries safely with the event id after a crash between enqueue and acknowledgement', async () => {
    const { service, enqueue, crashAfterEnqueue } = createHarness();
    await service.runInTransaction(async (_transaction, emit) => {
      await emit({ topic: 'report.generate', payload: { reportId: 'report-1' } });
    });
    crashAfterEnqueue();

    await expect(service.publishBatch()).rejects.toThrow('simulated crash after enqueue');
    await expect(service.publishBatch()).resolves.toBe(1);

    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue.mock.calls[0]?.[2]).toEqual({ idempotencyKey: 'outbox:event-1' });
    expect(enqueue.mock.calls[1]?.[2]).toEqual({ idempotencyKey: 'outbox:event-1' });
  });

  it('reports the pending event count and oldest-event lag', async () => {
    const { service } = createHarness();
    await service.runInTransaction(async (_transaction, emit) => {
      await emit({ topic: 'email.send', payload: { messageId: 'message-1' } });
    });

    const metrics = await service.getMetrics(new Date(Date.now() + 2_000));

    expect(metrics.unpublishedCount).toBe(1);
    expect(metrics.oldestUnpublishedAt).toBeInstanceOf(Date);
    expect(metrics.lagMilliseconds).toBeGreaterThanOrEqual(2_000);
  });
});
