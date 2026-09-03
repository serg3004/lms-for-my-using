import type { IncomingMessage, ServerResponse } from 'node:http';

import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

type NextFunction = () => void;
type HttpRequest = IncomingMessage & { originalUrl?: string };

export const metricsRegistry = new Registry();

collectDefaultMetrics({ prefix: 'lms_', register: metricsRegistry });

export const httpRequests = new Counter({
  name: 'lms_http_requests_total',
  help: 'Completed HTTP requests.',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry],
});

export const httpDuration = new Histogram({
  name: 'lms_http_request_duration_seconds',
  help: 'HTTP request latency. Use histogram_quantile for p95.',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const redisErrors = new Counter({
  name: 'lms_redis_errors_total',
  help: 'Redis operation failures by bounded component.',
  labelNames: ['component'] as const,
  registers: [metricsRegistry],
});

export const rateLimitRejects = new Counter({
  name: 'lms_rate_limit_rejects_total',
  help: 'Requests rejected by the sensitive-route limiter.',
  labelNames: ['route', 'mode'] as const,
  registers: [metricsRegistry],
});

export const refreshReuse = new Counter({
  name: 'lms_auth_refresh_reuse_total',
  help: 'Invalid refresh attempts, including already consumed token reuse.',
  registers: [metricsRegistry],
});

export const s3Duration = new Histogram({
  name: 'lms_s3_operation_duration_seconds',
  help: 'S3 operation latency without bucket or object-key labels.',
  labelNames: ['operation', 'outcome'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [metricsRegistry],
});

export const s3Errors = new Counter({
  name: 'lms_s3_errors_total',
  help: 'S3 failures by bounded operation name; bucket names and object keys are never labels.',
  labelNames: ['operation'] as const,
  registers: [metricsRegistry],
});

export const queueDepth = new Gauge({
  name: 'lms_queue_depth',
  help: 'Jobs waiting or delayed in the background queue.',
  labelNames: ['queue', 'state'] as const,
  registers: [metricsRegistry],
});

export const jobs = new Counter({
  name: 'lms_background_jobs_total',
  help: 'Background job outcomes by bounded job name.',
  labelNames: ['name', 'outcome'] as const,
  registers: [metricsRegistry],
});

export const passwordResetDeliveryErrors = new Counter({
  name: 'lms_password_reset_delivery_errors_total',
  help: 'Password reset delivery failures by bounded reason. Never labeled with tokens, URLs, or emails.',
  labelNames: ['reason'] as const,
  registers: [metricsRegistry],
});

export const retryExhausted = new Counter({
  name: 'lms_background_job_retry_exhausted_total',
  help: 'Background jobs that exhausted all configured attempts.',
  labelNames: ['name'] as const,
  registers: [metricsRegistry],
});

const ORG_DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30];

export const orgDepartmentTreeQueryDuration = new Histogram({
  name: 'lms_org_department_tree_query_duration_seconds',
  help: 'Organization-tree query latency by bounded operation and outcome.',
  labelNames: ['operation', 'outcome'] as const,
  buckets: ORG_DURATION_BUCKETS,
  registers: [metricsRegistry],
});

export const orgScopeResolutionDuration = new Histogram({
  name: 'lms_org_scope_resolution_duration_seconds',
  help: 'Organization access-scope resolution latency by bounded operation and outcome.',
  labelNames: ['operation', 'outcome'] as const,
  buckets: ORG_DURATION_BUCKETS,
  registers: [metricsRegistry],
});

export const orgLearningTargetResolutionDuration = new Histogram({
  name: 'lms_org_learning_target_resolution_duration_seconds',
  help: 'Learning-target resolution latency by outcome.',
  labelNames: ['outcome'] as const,
  buckets: ORG_DURATION_BUCKETS,
  registers: [metricsRegistry],
});

export const orgReportQueryDuration = new Histogram({
  name: 'lms_org_report_query_duration_seconds',
  help: 'Organization-aware report query latency by bounded report and outcome.',
  labelNames: ['report', 'outcome'] as const,
  buckets: ORG_DURATION_BUCKETS,
  registers: [metricsRegistry],
});

export const orgImportRows = new Counter({
  name: 'lms_org_import_rows_total',
  help: 'Rows accepted or rejected by organization imports.',
  labelNames: ['kind', 'stage', 'outcome'] as const,
  registers: [metricsRegistry],
});

export const orgImportFailures = new Counter({
  name: 'lms_org_import_failures_total',
  help: 'Organization import failures by bounded kind, stage and reason.',
  labelNames: ['kind', 'stage', 'reason'] as const,
  registers: [metricsRegistry],
});

export const orgReparentConflicts = new Counter({
  name: 'lms_org_reparent_conflicts_total',
  help: 'Rejected department reparent operations by bounded reason.',
  labelNames: ['reason'] as const,
  registers: [metricsRegistry],
});

export function normalizeHttpRoute(url: string): string {
  const path = url.split('?')[0] || '/';
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .slice(0, 160);
}

export function createHttpMetricsMiddleware() {
  return (request: HttpRequest, response: ServerResponse, next: NextFunction): void => {
    if ((request.originalUrl ?? request.url ?? '').split('?')[0] === '/api/v1/metrics') {
      next();
      return;
    }
    const started = process.hrtime.bigint();
    response.once('finish', () => {
      const labels = {
        method: request.method ?? 'UNKNOWN',
        route: normalizeHttpRoute(request.originalUrl ?? request.url ?? '/'),
        status_code: String(response.statusCode),
      };
      httpRequests.inc(labels);
      httpDuration.observe(labels, Number(process.hrtime.bigint() - started) / 1e9);
    });
    next();
  };
}

export async function observeS3<T>(operation: string, action: () => Promise<T>): Promise<T> {
  const end = s3Duration.startTimer({ operation });
  try {
    const result = await action();
    end({ outcome: 'success' });
    return result;
  } catch (error) {
    end({ outcome: 'error' });
    throw error;
  }
}
