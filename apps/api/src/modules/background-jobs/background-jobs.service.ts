import { ConflictException, Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

import { BACKGROUND_JOB_BACKEND } from './background-job.backend.js';
import type { BackgroundJobBackend } from './background-job.backend.js';
import type {
  BackgroundJobData,
  BackgroundJobHandler,
  EnqueuedBackgroundJob,
  EnqueueBackgroundJobOptions,
  RecurringBackgroundJobOptions,
} from './background-jobs.types.js';
import { getTelemetryContext, resolveRequestId, runWithTelemetryContext } from '../../common/telemetry/telemetry-context.js';

const DEFAULT_ATTEMPTS = 5;
const DEFAULT_BACKOFF_MS = 1_000;

@Injectable()
export class BackgroundJobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BackgroundJobsService.name);
  private readonly handlers = new Map<string, BackgroundJobHandler>();
  private readonly recurringJobs = new Map<string, {
    name: string;
    data: BackgroundJobData;
    options: Required<RecurringBackgroundJobOptions>;
  }>();

  constructor(@Inject(BACKGROUND_JOB_BACKEND) private readonly backend: BackgroundJobBackend) {}

  registerHandler(name: string, handler: BackgroundJobHandler): void {
    if (this.handlers.has(name)) throw new ConflictException(`Background job handler "${name}" is already registered`);
    this.handlers.set(name, handler);
  }

  registerRecurring(
    name: string,
    data: BackgroundJobData,
    options: RecurringBackgroundJobOptions,
  ): void {
    if (this.recurringJobs.has(options.schedulerId)) {
      throw new ConflictException(`Background job scheduler "${options.schedulerId}" is already registered`);
    }
    this.recurringJobs.set(options.schedulerId, {
      name,
      data,
      options: {
        schedulerId: options.schedulerId,
        everyMs: options.everyMs,
        attempts: options.attempts ?? DEFAULT_ATTEMPTS,
        backoffMs: options.backoffMs ?? DEFAULT_BACKOFF_MS,
      },
    });
  }

  enqueue(
    name: string,
    data: BackgroundJobData,
    options: EnqueueBackgroundJobOptions,
  ): Promise<EnqueuedBackgroundJob> {
    return this.backend.enqueue(name, data, {
      idempotencyKey: options.idempotencyKey,
      attempts: options.attempts ?? DEFAULT_ATTEMPTS,
      backoffMs: options.backoffMs ?? DEFAULT_BACKOFF_MS,
      telemetryContext: options.telemetryContext ?? getTelemetryContext() ?? { requestId: resolveRequestId(undefined) },
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (process.env['BACKGROUND_JOBS_RUN_WORKER'] !== 'true') return;
    await this.backend.start(async (job) => {
      const handler = this.handlers.get(job.name);
      if (!handler) throw new Error(`No handler registered for background job "${job.name}"`);
      const execute = async () => {
        await handler(job);
        this.logger.debug({ jobId: job.id }, 'Background job completed');
      };
      if (job.telemetryContext) await runWithTelemetryContext(job.telemetryContext, execute);
      else await execute();
    });
    for (const recurring of this.recurringJobs.values()) {
      await this.backend.upsertRecurring(recurring.name, recurring.data, recurring.options);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.backend.close();
  }
}
