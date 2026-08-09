import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { BackgroundJobsService } from '../background-jobs/public.js';
import type { OutboxEventInput, OutboxMetrics } from './outbox.types.js';

type ClaimedOutboxEvent = {
  id: string;
  topic: string;
  payload: Prisma.JsonValue;
  created_at: Date;
};

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_RETENTION_HOURS = 24 * 7;

@Injectable()
export class OutboxService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private pollTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private publishing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly backgroundJobs: BackgroundJobsService,
  ) {}

  /** Runs the mutation and all emitted events in one database transaction. */
  runInTransaction<T>(
    operation: (
      transaction: Prisma.TransactionClient,
      emit: (event: OutboxEventInput) => Promise<void>,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => operation(
      transaction,
      async (event) => {
        await transaction.outboxEvent.create({ data: event });
      },
    ));
  }

  async publishBatch(batchSize = DEFAULT_BATCH_SIZE): Promise<number> {
    if (this.publishing) return 0;
    this.publishing = true;
    try {
      let published = 0;
      for (let index = 0; index < batchSize; index++) {
        const didPublish = await this.publishNext();
        if (!didPublish) break;
        published++;
      }
      return published;
    } finally {
      this.publishing = false;
    }
  }

  async getMetrics(now = new Date()): Promise<OutboxMetrics> {
    const [unpublishedCount, oldest] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { publishedAt: null } }),
      this.prisma.outboxEvent.findFirst({
        where: { publishedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    const oldestUnpublishedAt = oldest?.createdAt ?? null;
    return {
      unpublishedCount,
      oldestUnpublishedAt,
      lagMilliseconds: oldestUnpublishedAt ? Math.max(0, now.getTime() - oldestUnpublishedAt.getTime()) : 0,
    };
  }

  async cleanupPublished(retentionHours = DEFAULT_RETENTION_HOURS, now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - retentionHours * 60 * 60 * 1_000);
    const result = await this.prisma.outboxEvent.deleteMany({
      where: { publishedAt: { not: null, lt: cutoff } },
    });
    return result.count;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (process.env['BACKGROUND_JOBS_RUN_WORKER'] !== 'true') return;
    const interval = Number(process.env['OUTBOX_POLL_INTERVAL_MS'] ?? DEFAULT_POLL_INTERVAL_MS);
    await this.poll();
    await this.cleanup();
    this.pollTimer = setInterval(() => void this.poll(), interval);
    this.pollTimer.unref();
    this.cleanupTimer = setInterval(() => void this.cleanup(), 60 * 60 * 1_000);
    this.cleanupTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    while (this.publishing) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  private async publishNext(): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<ClaimedOutboxEvent[]>`
        SELECT id, topic, payload, created_at
        FROM outbox_events
        WHERE published_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;
      const event = rows[0];
      if (!event) return false;

      await this.backgroundJobs.enqueue(event.topic, event.payload as Record<string, unknown>, {
        idempotencyKey: `outbox:${event.id}`,
      });
      await transaction.outboxEvent.update({
        where: { id: event.id },
        data: { publishedAt: new Date() },
      });
      return true;
    });
  }

  private async poll(): Promise<void> {
    try {
      const published = await this.publishBatch();
      const metrics = await this.getMetrics();
      if (published > 0 || metrics.unpublishedCount > 0) {
        this.logger.log({ published, ...metrics }, 'Transactional outbox poll completed');
      }
    } catch (error) {
      this.logger.error('Transactional outbox poll failed; events remain pending for retry', error);
    }
  }

  private async cleanup(): Promise<void> {
    try {
      const deleted = await this.cleanupPublished();
      if (deleted > 0) this.logger.log({ deleted }, 'Published outbox events cleaned up');
    } catch (error) {
      this.logger.error('Transactional outbox cleanup failed', error);
    }
  }
}
