export type BackgroundJobData = Record<string, unknown>;

export type BackgroundJob = {
  id: string;
  name: string;
  data: BackgroundJobData;
  attemptsMade: number;
  telemetryContext?: { requestId: string };
};

export type EnqueueBackgroundJobOptions = {
  idempotencyKey: string;
  attempts?: number;
  backoffMs?: number;
  telemetryContext?: { requestId: string };
};

export type RecurringBackgroundJobOptions = {
  schedulerId: string;
  everyMs: number;
  attempts?: number;
  backoffMs?: number;
};

export type BackgroundJobHandler = (job: BackgroundJob) => Promise<void>;

export type EnqueuedBackgroundJob = {
  id: string;
  deduplicated: boolean;
};
