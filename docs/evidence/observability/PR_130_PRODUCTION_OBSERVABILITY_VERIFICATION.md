# PR 130 — Production observability verification

**Проверено:** 2026-08-22  
**Статус:** repository scope complete; production integrations require live configuration and verification

## Решение

Повторная реализация PR 130 не нужна. Актуальное состояние `main` уже покрывает
исходные требования health/logging/error tracking, runtime/deployment visibility
и базовых alert rules. Этот документ фиксирует проверяемые repository evidence и
не выдаёт наличие конфигурации за подтверждение текущего состояния production.

Рассматривались два варианта:

1. добавить второй observability stack или заменить существующий;
2. переиспользовать текущий единый stack и закрыть устаревший пункт плана после
   проверки его компонентов.

Выбран вариант 2: параллельные logger, metrics или tracing pipelines увеличили бы
операционную сложность и риск дублирования событий без нового требования PR 130.

## Покрытие требований

| Требование PR 130 | Repository evidence | Результат |
| --- | --- | --- |
| Health visibility | `/api/v1/health/live` проверяет процесс, а `/api/v1/health/ready` — готовность обязательных зависимостей; integration tests покрывают оба endpoint | Готово |
| Structured runtime logs | `nestjs-pino` пишет JSON в production и human-readable output вне production | Готово |
| Безопасность логов | централизованные redact paths закрывают credentials, cookies, authorization, tokens, passwords и DSN; тесты проверяют redaction | Готово |
| Correlation | валидированный `X-Request-ID` переиспользуется logger и async telemetry context и возвращается клиенту | Готово |
| Error tracking | Sentry инициализируется только при наличии валидного `SENTRY_DSN`; без DSN API не зависит от внешнего error tracker | Готово |
| Metrics | защищённый bearer token endpoint отдаёт bounded HTTP, dependency, security, queue и Prisma metrics | Готово |
| Distributed tracing | OTLP exporter включается только через `OTEL_EXPORTER_OTLP_ENDPOINT`; service name валидируется | Готово |
| Dashboard and alerts | в репозитории есть Grafana dashboard, Prometheus SLO recording/alert rules и отдельный безопасный alert-routing drill | Готово |
| Deployment visibility | runbook требует сверять deploy events с logs/traces по request ID и описывает ownership/escalation | Готово в repository scope |

## Production boundary

Репозиторий не может подтвердить, что внешние Prometheus, Grafana, Alertmanager,
OTLP collector или Sentry сейчас настроены и получают production telemetry.
Активация намеренно зависит от environment variables и инфраструктуры. После
деплоя оператор должен:

1. проверить liveness/readiness через intended Web/private-API topology;
2. выполнить authenticated scrape `/api/v1/metrics` без вывода bearer token;
3. подтвердить ingestion JSON logs и, если включён, trace/error event;
4. импортировать dashboard и загрузить SLO rules;
5. выполнить opt-in alert-routing drill по `docs/runbooks/SLO_ALERTS.md`;
6. привязать результаты к точному deployment SHA и времени проверки.

До выполнения этих шагов корректный статус production — `LIVE-VERIFY`, а не
утверждение о работающих внешних интеграциях.

## Проверка репозитория

Релевантный минимальный gate:

```bash
pnpm --filter @lms/api test -- --runInBand
pnpm --filter @lms/api typecheck
pnpm --filter @lms/api lint
pnpm --filter @lms/api build
```
