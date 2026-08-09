import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { BackgroundJobsService } from '../background-jobs/public.js';

type ClaimedEvent = { id: string; topic: string; payload: Prisma.JsonValue; attempts: number };

@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: BackgroundJobsService,
  ) {}

  async publishBatch(batchSize = 100): Promise<number> {
    const events = await this.claim(batchSize);
    for (const event of events) await this.publish(event);
    return events.length;
  }

  async cleanup(retentionDays = 7): Promise<number> {
    const before = new Date(Date.now() - retentionDays * 86_400_000);
    const result = await this.prisma.outboxEvent.deleteMany({ where: { publishedAt: { lt: before } } });
    return result.count;
  }

  private claim(batchSize: number): Promise<ClaimedEvent[]> {
    const limit = Math.max(1, Math.min(batchSize, 1_000));
    return this.prisma.$queryRaw<ClaimedEvent[]>(Prisma.sql`
      UPDATE "outbox_events"
      SET "locked_at" = NOW(), "attempts" = "attempts" + 1
      WHERE "id" IN (
        SELECT "id" FROM "outbox_events"
        WHERE "published_at" IS NULL
          AND "next_attempt_at" <= NOW()
          AND ("locked_at" IS NULL OR "locked_at" < NOW() - INTERVAL '5 minutes')
        ORDER BY "occurred_at"
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING "id", "topic", "payload", "attempts"
    `);
  }

  private async publish(event: ClaimedEvent): Promise<void> {
    try {
      await this.jobs.enqueue(event.topic, { outboxEventId: event.id, payload: event.payload }, {
        idempotencyKey: `outbox:${event.id}`,
      });
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { publishedAt: new Date(), lockedAt: null, lastError: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const delayMs = Math.min(60_000, 1_000 * 2 ** Math.min(event.attempts - 1, 6));
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { lockedAt: null, lastError: message, nextAttemptAt: new Date(Date.now() + delayMs) },
      });
      this.logger.error(`Failed to publish outbox event ${event.id}`, error);
    }
  }
}
