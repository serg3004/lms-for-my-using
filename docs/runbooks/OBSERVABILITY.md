# Metrics and tracing

## Prometheus

The API exposes `GET /api/v1/metrics`. In production, `METRICS_BEARER_TOKEN`
(at least 32 characters) is mandatory and the scraper must send
`Authorization: Bearer <token>`. Keep the endpoint private at the network layer
as well. Local environments may omit the token.

Useful queries:

```promql
# Request rate
sum by (method, route) (rate(lms_http_requests_total[5m]))

# p95 latency
histogram_quantile(0.95, sum by (le, method, route) (rate(lms_http_request_duration_seconds_bucket[5m])))

# 5xx rate
sum(rate(lms_http_requests_total{status_code=~"5.."}[5m]))

# Prisma pool
prisma_pool_connections_open
prisma_pool_connections_busy

# Dependencies and security signals
rate(lms_redis_errors_total[5m])
rate(lms_rate_limit_rejects_total[5m])
rate(lms_auth_refresh_reuse_total[5m])
histogram_quantile(0.95, sum by (le, operation) (rate(lms_s3_operation_duration_seconds_bucket[5m])))
lms_queue_depth
```

### Organization structure

The org-structure domain publishes latency histograms for tree reads, manager
scope resolution, learning-target resolution and reports, plus import-row,
import-failure and reparent-conflict counters:

```promql
histogram_quantile(0.95, sum by (le, operation) (rate(lms_org_department_tree_query_duration_seconds_bucket[5m])))
histogram_quantile(0.95, sum by (le, operation) (rate(lms_org_scope_resolution_duration_seconds_bucket[5m])))
histogram_quantile(0.95, sum by (le) (rate(lms_org_learning_target_resolution_duration_seconds_bucket[5m])))
histogram_quantile(0.95, sum by (le, report) (rate(lms_org_report_query_duration_seconds_bucket[5m])))
sum by (kind, stage, outcome) (rate(lms_org_import_rows_total[5m]))
sum by (kind, stage, reason) (rate(lms_org_import_failures_total[5m]))
sum by (reason) (rate(lms_org_reparent_conflicts_total[5m]))
```

Diagnostics use the events `org_reparent_failed`, `org_import_failed`, and
`org_scope_resolution_failed`. Their reason, operation, kind and stage fields
are bounded application values. Do not add IDs,
names, codes, filenames, raw CSV, preview hashes/tokens, request bodies or raw
error messages to either metric labels or these diagnostic records.

Labels are deliberately bounded. HTTP query strings, UUID/numeric path values,
tenant/user identifiers, request IDs, S3 buckets/object keys, SQL and job data
are never metric labels. Job `name` must remain an application-defined constant.

## OpenTelemetry traces

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to enable the OTLP/HTTP exporter and optionally
set `OTEL_SERVICE_NAME` (default `lms-api`). Standard OpenTelemetry exporter
variables, including headers, are honored by the exporter. Auto-instrumentation
covers HTTP, Prisma/PostgreSQL, Redis/ioredis, AWS SDK and BullMQ. The metrics
scrape endpoint and filesystem calls are excluded to avoid noise and secrets.

Do not configure request bodies, HTTP headers, SQL parameters, job payloads or
S3 object keys as custom span attributes. Correlate application logs and traces
using the existing validated `X-Request-ID` telemetry context.

## SLOs, alerts and dashboard

Prometheus recording/alerting rules live in
`infra/monitoring/prometheus/slo.rules.yml`. Load that file in Prometheus and
route its `critical` and `warning` severities through Alertmanager. Import
`infra/monitoring/grafana/lms-slo-dashboard.json` into Grafana. The objectives,
ownership, escalation policy, triage steps and opt-in alert-routing drill are in
`docs/runbooks/SLO_ALERTS.md`.

## Известные инциденты деплоя

**2026-08-10 — crash-loop API на Railway после мержа PR #577 (observability).**
Причина: `METRICS_BEARER_TOKEN` стал обязательным в production (`apps/api/src/config/env.ts`),
но не был добавлен в переменные окружения сервиса `api` на Railway.
`loadApiEnv()` кидал ошибку при каждом старте — контейнер уходил в CRASHED.

Исправлено добавлением `METRICS_BEARER_TOKEN` (32+ символов) в Railway dashboard
сервиса `api` (без изменений кода).

**Вывод на будущее:** при добавлении новой обязательной production-переменной в
`env.ts` — сразу проверять/добавлять её в Railway для всех окружений, иначе
следующий деплой уйдёт в crash-loop.
