import { ServiceUnavailableException } from '@nestjs/common';

import type { BackgroundJobBackend } from './background-job.backend.js';
import type {
  BackgroundJobData,
  BackgroundJobHandler,
  EnqueuedBackgroundJob,
  EnqueueBackgroundJobOptions,
  RecurringBackgroundJobOptions,
} from './background-jobs.types.js';

export class DisabledBackgroundJobBackend implements BackgroundJobBackend {
  async start(processor: BackgroundJobHandler): Promise<void> {
    void processor;
  }
  async enqueue(
    name: string,
    data: BackgroundJobData,
    options: Required<EnqueueBackgroundJobOptions>,
  ): Promise<EnqueuedBackgroundJob> {
    void name;
    void data;
    void options;
    throw new ServiceUnavailableException('Background jobs are not configured');
  }
  async upsertRecurring(
    name: string,
    data: BackgroundJobData,
    options: Required<RecurringBackgroundJobOptions>,
  ): Promise<void> {
    void name;
    void data;
    void options;
  }

  async close(): Promise<void> {}
}
