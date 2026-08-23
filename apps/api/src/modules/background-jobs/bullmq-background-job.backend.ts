import { Logger } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { createHash } from 'node:crypto';
import { jobs, queueDepth, redisErrors } from '../../common/observability/metrics.js';

import type { BackgroundJobBackend } from './background-job.backend.js';
import { toBackgroundJob } from './background-job.backend.js';
import type {
  BackgroundJobData,
  BackgroundJobHandler,
  EnqueuedBackgroundJob,
  EnqueueBackgroundJobOptions,
  RecurringBackgroundJobOptions,
} from './background-jobs.types.js';
type StoredJob = { data: BackgroundJobData; idempotencyKey: string; telemetryContext?: { requestId: string } };

export class BullMqBackgroundJobBackend implements BackgroundJobBackend {
  private readonly logger = new Logger(BullMqBackgroundJobBackend.name);
  private readonly queue: Queue<StoredJob>;
  private readonly deadLetterQueue: Queue<StoredJob & { sourceJobId: string; failedReason: string }>;
  private worker: Worker<StoredJob> | null = null;
  constructor(
    private readonly redisUrl: string,
    private readonly queueName = process.env['BACKGROUND_JOBS_QUEUE'] ?? 'lms-background-jobs',
    private readonly concurrency = Number(process.env['BACKGROUND_JOBS_CONCURRENCY'] ?? 5),
  ) {
    const connection = { url: this.redisUrl };
    this.queue = new Queue<StoredJob>(queueName, { connection });
    this.deadLetterQueue = new Queue(`${queueName}-dead-letter`, { connection });
  }
  async start(processor: BackgroundJobHandler): Promise<void> {
    if (this.worker) return;
    this.worker = new Worker<StoredJob>(
      this.queueName,
      async (job) => processor(toBackgroundJob(job.id, job.name, job.data.data, job.attemptsMade, job.data.telemetryContext)),
      { connection: { url: this.redisUrl }, concurrency: this.concurrency },
    );
    this.worker.on('failed', (job, error) => {
      if (job) jobs.inc({ name: job.name, outcome: 'failed' });
      if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
      this.logger.error(`Background job ${job.id ?? 'unknown'} exhausted retries`, error.stack);
      void this.moveToDeadLetter(job, error).catch((deadLetterError: unknown) => {
        this.logger.error('Failed to persist dead-letter job', deadLetterError);
      });
    });
    this.worker.on('completed', (job) => {
      jobs.inc({ name: job.name, outcome: 'completed' });
      void this.updateDepth();
    });
    this.worker.on('error', (error) => {
      redisErrors.inc({ component: 'background_jobs' });
      this.logger.error('Background worker error', error.stack);
    });
    await this.worker.waitUntilReady();
  }
  async enqueue(
    name: string,
    data: BackgroundJobData,
    options: Required<EnqueueBackgroundJobOptions>,
  ): Promise<EnqueuedBackgroundJob> {
    const id = createHash('sha256').update(`${name}:${options.idempotencyKey}`).digest('hex');
    const existing = await this.queue.getJob(id);
    if (existing) return { id, deduplicated: true };
    await this.queue.add(name, { data, idempotencyKey: options.idempotencyKey, telemetryContext: options.telemetryContext }, {
      jobId: id,
      attempts: options.attempts,
      backoff: { type: 'exponential', delay: options.backoffMs },
      removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
      removeOnFail: false,
    });
    jobs.inc({ name, outcome: 'enqueued' });
    await this.updateDepth();
    return { id, deduplicated: false };
  }
  async upsertRecurring(
    name: string,
    data: BackgroundJobData,
    options: Required<RecurringBackgroundJobOptions>,
  ): Promise<void> {
    await this.queue.upsertJobScheduler(
      options.schedulerId,
      { every: options.everyMs },
      {
        name,
        data: { data, idempotencyKey: options.schedulerId },
        opts: {
          attempts: options.attempts,
          backoff: { type: 'exponential', delay: options.backoffMs },
          removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
          removeOnFail: false,
        },
      },
    );
  }
  async close(): Promise<void> {
    await this.worker?.close();
    await Promise.all([this.queue.close(), this.deadLetterQueue.close()]);
  }

  private async moveToDeadLetter(job: Job<StoredJob>, error: Error): Promise<void> {
    await this.deadLetterQueue.add(job.name, {
      ...job.data,
      sourceJobId: job.id ?? 'unknown',
      failedReason: error.message,
    }, { jobId: `dead-${job.id ?? 'unknown'}`, removeOnComplete: false, removeOnFail: false });
  }
  private async updateDepth(): Promise<void> {
    try {
      const counts = await this.queue.getJobCounts('waiting', 'delayed');
      queueDepth.set({ queue: 'background', state: 'waiting' }, counts.waiting ?? 0);
      queueDepth.set({ queue: 'background', state: 'delayed' }, counts.delayed ?? 0);
    } catch {
      redisErrors.inc({ component: 'background_jobs' });
    }
  }
}
