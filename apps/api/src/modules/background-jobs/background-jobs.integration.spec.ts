import { createHash } from 'node:crypto';

import type { BackgroundJobBackend } from './background-job.backend.js';
import { toBackgroundJob } from './background-job.backend.js';
import { BackgroundJobsService } from './background-jobs.service.js';
import type {
  BackgroundJobData,
  BackgroundJobHandler,
  EnqueuedBackgroundJob,
  EnqueueBackgroundJobOptions,
  RecurringBackgroundJobOptions,
} from './background-jobs.types.js';
import { getTelemetryContext, runWithTelemetryContext } from '../../common/telemetry/telemetry-context.js';
type PendingJob = {
  id: string;
  name: string;
  data: BackgroundJobData;
  options: Required<EnqueueBackgroundJobOptions>;
};
class InMemoryBackgroundJobBackend implements BackgroundJobBackend {
  readonly deadLetters: Array<{ id: string; error: string }> = [];
  readonly executions = new Map<string, number>();
  readonly backoffs: number[] = [];
  readonly recurring: Array<{ name: string; data: BackgroundJobData; options: Required<RecurringBackgroundJobOptions> }> = [];
  closed = false;
  private processor: BackgroundJobHandler | null = null;
  private readonly jobs = new Map<string, PendingJob>();
  private draining = Promise.resolve();

  async start(processor: BackgroundJobHandler): Promise<void> {
    this.processor = processor;
  }
  async enqueue(
    name: string,
    data: BackgroundJobData,
    options: Required<EnqueueBackgroundJobOptions>,
  ): Promise<EnqueuedBackgroundJob> {
    const id = createHash('sha256').update(`${name}:${options.idempotencyKey}`).digest('hex');
    if (this.jobs.has(id)) return { id, deduplicated: true };
    const job = { id, name, data, options };
    this.jobs.set(id, job);
    this.draining = this.draining.then(() => this.execute(job));
    return { id, deduplicated: false };
  }
  async upsertRecurring(
    name: string,
    data: BackgroundJobData,
    options: Required<RecurringBackgroundJobOptions>,
  ): Promise<void> {
    this.recurring.push({ name, data, options });
  }
  async getOperationalStatus() {
    return {
      status: 'ok' as const,
      waiting: this.jobs.size,
      active: 0,
      delayed: 0,
      failed: 0,
      deadLetter: this.deadLetters.length,
    };
  }
  async close(): Promise<void> {
    await this.draining;
    this.closed = true;
  }

  drain(): Promise<void> {
    return this.draining;
  }
  private async execute(job: PendingJob): Promise<void> {
    if (!this.processor) throw new Error('Worker is not started');
    for (let attempt = 0; attempt < job.options.attempts; attempt++) {
      this.executions.set(job.id, attempt + 1);
      try {
        await this.processor(toBackgroundJob(job.id, job.name, job.data, attempt, job.options.telemetryContext));
        return;
      } catch (error) {
        if (attempt + 1 === job.options.attempts) {
          this.deadLetters.push({ id: job.id, error: error instanceof Error ? error.message : String(error) });
          return;
        }
        this.backoffs.push(job.options.backoffMs * 2 ** attempt);
      }
    }
  }
}
describe('background jobs integration', () => {
  const previousWorkerFlag = process.env['BACKGROUND_JOBS_RUN_WORKER'];

  beforeEach(() => {
    process.env['BACKGROUND_JOBS_RUN_WORKER'] = 'true';
  });

  afterAll(() => {
    if (previousWorkerFlag === undefined) delete process.env['BACKGROUND_JOBS_RUN_WORKER'];
    else process.env['BACKGROUND_JOBS_RUN_WORKER'] = previousWorkerFlag;
  });
  it('enqueues quickly, retries with backoff and applies an idempotency key once', async () => {
    const backend = new InMemoryBackgroundJobBackend();
    const service = new BackgroundJobsService(backend);
    let handlerCalls = 0;
    let appliedResults = 0;
    service.registerHandler('report.generate', async () => {
      handlerCalls++;
      if (handlerCalls < 3) throw new Error('temporary report dependency failure');
      appliedResults++;
    });
    await service.onApplicationBootstrap();
    const first = await service.enqueue('report.generate', { reportId: 'report-1' }, {
      idempotencyKey: 'report-1:v1', attempts: 3, backoffMs: 10,
    });
    const duplicate = await service.enqueue('report.generate', { reportId: 'report-1' }, {
      idempotencyKey: 'report-1:v1', attempts: 3, backoffMs: 10,
    });
    expect(first.deduplicated).toBe(false);
    expect(duplicate).toEqual({ id: first.id, deduplicated: true });
    await backend.drain();
    expect(handlerCalls).toBe(3);
    expect(appliedResults).toBe(1);
    expect(backend.backoffs).toEqual([10, 20]);
  });
  it('upserts registered recurring jobs when the worker starts', async () => {
    const backend = new InMemoryBackgroundJobBackend();
    const service = new BackgroundJobsService(backend);
    service.registerRecurring('checklists.expire-overdue', {}, {
      schedulerId: 'checklists-expire-overdue-v1',
      everyMs: 60_000,
      attempts: 3,
      backoffMs: 1_000,
    });

    await service.onApplicationBootstrap();

    expect(backend.recurring).toEqual([{
      name: 'checklists.expire-overdue',
      data: {},
      options: {
        schedulerId: 'checklists-expire-overdue-v1',
        everyMs: 60_000,
        attempts: 3,
        backoffMs: 1_000,
      },
    }]);
  });
  it('moves exhausted failures to an observable dead-letter collection', async () => {
    const backend = new InMemoryBackgroundJobBackend();
    const service = new BackgroundJobsService(backend);
    service.registerHandler('email.send', async () => { throw new Error('mail provider unavailable'); });
    await service.onApplicationBootstrap();
    const job = await service.enqueue('email.send', { messageId: 'message-1' }, {
      idempotencyKey: 'message-1', attempts: 2, backoffMs: 5,
    });
    await backend.drain();

    expect(backend.executions.get(job.id)).toBe(2);
    expect(backend.deadLetters).toEqual([{ id: job.id, error: 'mail provider unavailable' }]);
  });
  it('waits for pending work during graceful shutdown', async () => {
    const backend = new InMemoryBackgroundJobBackend();
    const service = new BackgroundJobsService(backend);
    service.registerHandler('cleanup.run', async () => undefined);
    await service.onApplicationBootstrap();
    await service.enqueue('cleanup.run', {}, { idempotencyKey: 'cleanup:2026-08-09' });

    await service.onModuleDestroy();

    expect(backend.closed).toBe(true);
  });
  it('propagates the enqueue telemetry context into the job handler', async () => {
    const backend = new InMemoryBackgroundJobBackend();
    const service = new BackgroundJobsService(backend);
    let observedRequestId: string | undefined;
    service.registerHandler('telemetry.verify', async () => {
      await Promise.resolve();
      observedRequestId = getTelemetryContext()?.requestId;
    });
    await service.onApplicationBootstrap();
    await runWithTelemetryContext({ requestId: 'a8098c1a-f86e-11da-bd1a-00112444be1e' }, () =>
      service.enqueue('telemetry.verify', {}, { idempotencyKey: 'telemetry-1' }),
    );
    await backend.drain();

    expect(observedRequestId).toBe('a8098c1a-f86e-11da-bd1a-00112444be1e');
  });
});
