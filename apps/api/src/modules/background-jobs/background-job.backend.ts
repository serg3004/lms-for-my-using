import type {
  BackgroundJob,
  BackgroundJobData,
  BackgroundJobHandler,
  EnqueueBackgroundJobOptions,
  EnqueuedBackgroundJob,
  RecurringBackgroundJobOptions,
} from './background-jobs.types.js';

export const BACKGROUND_JOB_BACKEND = Symbol('BACKGROUND_JOB_BACKEND');
export type BackgroundJobOperationalStatus = {
  status: 'ok' | 'disabled';
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  deadLetter: number;
};
export interface BackgroundJobBackend {
  start(processor: BackgroundJobHandler): Promise<void>;
  enqueue(
    name: string,
    data: BackgroundJobData,
    options: Required<EnqueueBackgroundJobOptions>,
  ): Promise<EnqueuedBackgroundJob>;
  upsertRecurring(
    name: string,
    data: BackgroundJobData,
    options: Required<RecurringBackgroundJobOptions>,
  ): Promise<void>;
  getOperationalStatus(): Promise<BackgroundJobOperationalStatus>;
  close(): Promise<void>;
}
export function toBackgroundJob(
  id: string | undefined,
  name: string,
  data: BackgroundJobData,
  attemptsMade: number,
  telemetryContext?: { requestId: string },
): BackgroundJob {
  return { id: id ?? 'unknown', name, data, attemptsMade, ...(telemetryContext ? { telemetryContext } : {}) };
}
