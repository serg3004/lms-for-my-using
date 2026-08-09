import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../database/prisma.service.js';
import type { OutboxEventInput, OutboxLag } from './transactional-outbox.types.js';

@Injectable()
export class TransactionalOutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async runInTransaction<T>(
    mutation: (transaction: Prisma.TransactionClient, addEvent: (event: OutboxEventInput) => Promise<string>) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => mutation(
      transaction,
      (event) => this.add(transaction, event),
    ));
  }

  async add(transaction: Prisma.TransactionClient, event: OutboxEventInput): Promise<string> {
    const id = event.id ?? randomUUID();
    await transaction.outboxEvent.create({ data: { id, topic: event.topic, payload: event.payload } });
    return id;
  }

  async getLag(now = new Date()): Promise<OutboxLag> {
    const [pending, oldest] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { publishedAt: null } }),
      this.prisma.outboxEvent.findFirst({
        where: { publishedAt: null },
        orderBy: { occurredAt: 'asc' },
        select: { occurredAt: true },
      }),
    ]);
    return { pending, oldestEventAgeMs: oldest ? Math.max(0, now.getTime() - oldest.occurredAt.getTime()) : 0 };
  }
}
