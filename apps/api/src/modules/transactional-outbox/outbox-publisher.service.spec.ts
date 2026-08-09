import { jest } from '@jest/globals';

import type { PrismaService } from '../../database/prisma.service.js';
import type { BackgroundJobsService } from '../background-jobs/public.js';
import { OutboxPublisherService } from './outbox-publisher.service.js';

describe('OutboxPublisherService', () => {
  it('publishes with a stable idempotency key and marks the event complete', async () => {
    const event = { id: 'event-1', topic: 'report.generate', payload: { reportId: 'report-1' }, attempts: 1 };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([event]),
      outboxEvent: { update: jest.fn().mockResolvedValue(event) },
    } as unknown as PrismaService;
    const jobs = { enqueue: jest.fn().mockResolvedValue({ id: 'job-1', deduplicated: false }) } as unknown as BackgroundJobsService;
    const publisher = new OutboxPublisherService(prisma, jobs);

    await expect(publisher.publishBatch()).resolves.toBe(1);
    expect(jobs.enqueue).toHaveBeenCalledWith(
      'report.generate',
      { outboxEventId: 'event-1', payload: { reportId: 'report-1' } },
      { idempotencyKey: 'outbox:event-1' },
    );
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event-1' }, data: expect.objectContaining({ publishedAt: expect.any(Date) }),
    }));
  });

  it('is duplicate-safe when the process crashes after enqueue and before marking published', async () => {
    const event = { id: 'event-2', topic: 'email.send', payload: {}, attempts: 1 };
    const update = jest.fn()
      .mockRejectedValueOnce(new Error('database connection lost after enqueue'))
      .mockResolvedValueOnce(event)
      .mockResolvedValueOnce(event);
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValueOnce([event]).mockResolvedValueOnce([{ ...event, attempts: 2 }]),
      outboxEvent: { update },
    } as unknown as PrismaService;
    const jobs = { enqueue: jest.fn()
      .mockResolvedValueOnce({ id: 'job-2', deduplicated: false })
      .mockResolvedValueOnce({ id: 'job-2', deduplicated: true }) } as unknown as BackgroundJobsService;
    const publisher = new OutboxPublisherService(prisma, jobs);

    await publisher.publishBatch();
    await publisher.publishBatch();

    expect(jobs.enqueue).toHaveBeenCalledTimes(2);
    expect(jobs.enqueue).toHaveBeenNthCalledWith(1, 'email.send', expect.anything(), { idempotencyKey: 'outbox:event-2' });
    expect(jobs.enqueue).toHaveBeenNthCalledWith(2, 'email.send', expect.anything(), { idempotencyKey: 'outbox:event-2' });
  });

  it('cleans up only published events older than the retention period', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 4 });
    const prisma = { outboxEvent: { deleteMany } } as unknown as PrismaService;
    const publisher = new OutboxPublisherService(prisma, {} as BackgroundJobsService);
    await expect(publisher.cleanup(7)).resolves.toBe(4);
    expect(deleteMany).toHaveBeenCalledWith({ where: { publishedAt: { lt: expect.any(Date) } } });
  });
});
