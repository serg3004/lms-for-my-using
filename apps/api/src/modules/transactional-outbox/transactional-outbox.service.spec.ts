import type { Prisma } from '@prisma/client';
import { jest } from '@jest/globals';

import type { PrismaService } from '../../database/prisma.service.js';
import { TransactionalOutboxService } from './transactional-outbox.service.js';

describe('TransactionalOutboxService', () => {
  it('commits the business mutation and event together', async () => {
    const committed: unknown[] = [];
    const prisma = {
      $transaction: async (callback: (transaction: Prisma.TransactionClient) => Promise<string>) => {
        const staged: unknown[] = [];
        const transaction = {
          course: { update: jest.fn(async ({ data }) => { staged.push(data); return data; }) },
          outboxEvent: { create: jest.fn(async ({ data }) => { staged.push(data); return data; }) },
        } as unknown as Prisma.TransactionClient;
        const result = await callback(transaction);
        committed.push(...staged);
        return result;
      },
    } as unknown as PrismaService;
    const service = new TransactionalOutboxService(prisma);

    const result = await service.runInTransaction(async (transaction, addEvent) => {
      await transaction.course.update({ where: { id: 'course-1' }, data: { title: 'Published' } });
      await addEvent({ id: '11111111-1111-4111-8111-111111111111', topic: 'course.published', payload: { courseId: 'course-1' } });
      return 'done';
    });

    expect(result).toBe('done');
    expect(committed).toEqual([
      { title: 'Published' },
      expect.objectContaining({ topic: 'course.published', payload: { courseId: 'course-1' } }),
    ]);
  });

  it('does not create an event when the business transaction rolls back', async () => {
    const committed: unknown[] = [];
    const prisma = {
      $transaction: async (callback: (transaction: Prisma.TransactionClient) => Promise<unknown>) => {
        const staged: unknown[] = [];
        const transaction = {
          outboxEvent: { create: jest.fn(async ({ data }) => { staged.push(data); return data; }) },
        } as unknown as Prisma.TransactionClient;
        const result = await callback(transaction);
        committed.push(...staged);
        return result;
      },
    } as unknown as PrismaService;
    const service = new TransactionalOutboxService(prisma);

    await expect(service.runInTransaction(async (_transaction, addEvent) => {
      await addEvent({ topic: 'course.published', payload: { courseId: 'course-1' } });
      throw new Error('business mutation failed');
    })).rejects.toThrow('business mutation failed');
    expect(committed).toEqual([]);
  });

  it('reports pending count and oldest-event lag', async () => {
    const prisma = {
      outboxEvent: {
        count: jest.fn().mockResolvedValue(3),
        findFirst: jest.fn().mockResolvedValue({ occurredAt: new Date('2026-08-09T10:00:00Z') }),
      },
    } as unknown as PrismaService;
    const service = new TransactionalOutboxService(prisma);
    await expect(service.getLag(new Date('2026-08-09T10:00:05Z'))).resolves.toEqual({
      pending: 3,
      oldestEventAgeMs: 5_000,
    });
  });
});
