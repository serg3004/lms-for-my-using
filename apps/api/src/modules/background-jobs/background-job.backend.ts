import type {
  BackgroundJob,
  BackgroundJobData,
  BackgroundJobHandler,
  EnqueueBackgroundJobOptions,
  EnqueuedBackgroundJob,
} from './background-jobs.types.js';

export const BACKGROUND_JOB_BACKEND = Symbol('BACKGROUND_JOB_BACKEND');

export interface BackgroundJobBackend {
  start(processor: BackgroundJobHandler): Promise<void>;
  enqueue(
    name: string,
    data: BackgroundJobData,
    options: Required<EnqueueBackgroundJobOptions>,
  ): Promise<EnqueuedBackgroundJob>;
  close(): Promise<void>;
}

export function toBackgroundJob(
  id: string | undefined,
  name: string,
  data: BackgroundJobData,
  attemptsMade: number,
): BackgroundJob {
  return { id: id ?? 'unknown', name, data, attemptsMade };
}
