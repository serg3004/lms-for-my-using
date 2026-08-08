# Продолжение аудита актуальности документации — часть 14

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. Продолжения `_CONTINUED.md`—`_CONTINUED_13.md` содержат результаты №21–33. Этот файл продолжает последовательный аудит с №34.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 34 | `RATE_LIMIT_FAILURE_POLICY.md` | ⚠️ Частично актуален | Runtime Redis-outage fallback реализован и тестируется; startup no-Redis escape hatch, readiness semantics и observability/alerting wording описаны неполно |

---

## 34. `RATE_LIMIT_FAILURE_POLICY.md`

**Статус:** ⚠️ частично актуален. Основной security contract документа реализован: sensitive routes не становятся неограниченными при runtime Redis failure, а переключаются на локальный emergency limiter с теми же thresholds. Drift находится вокруг второго режима — startup без Redis через explicit escape hatch — и вокруг observability/readiness terminology.

### Проверено

- `docs/RATE_LIMIT_FAILURE_POLICY.md`;
- `apps/api/src/common/middleware/api-hardening.ts`;
- `apps/api/src/common/middleware/api-hardening.spec.ts`;
- `apps/api/src/main.ts`;
- `apps/api/src/config/env.ts` и `env.spec.ts`;
- `apps/api/src/modules/health/redis-health.service.ts`;
- `apps/api/src/modules/health/health.controller.ts`;
- `.env.production.example`;
- `.github/workflows/ci.yml`;
- related rate-limit concern in `docs/CONCERNS.md`;
- current `README.md`;
- `AGENTS.md` / `CONTRIBUTING.md` lookup — оба отсутствуют в root (404);
- current `main` at PR #528.

### Подтверждённые факты

- Sensitive middleware защищает именно четыре POST route, перечисленные в policy:
  - `/api/v1/auth/login`;
  - `/api/v1/auth/password-reset/request`;
  - `/api/v1/auth/password-reset/confirm`;
  - `/api/v1/organizations/register`.
- Default rate-limit policy содержит IP, account и global rules. Account key применяется только к login/password-reset request и строится из normalized lowercase `organizationId + email`, после чего хешируется SHA-256; plaintext identity в Redis key не хранится.
- Redis store использует atomic Lua sequence `INCR` + `PEXPIRE` при первом increment, namespaced через `RATE_LIMIT_NAMESPACE`.
- При runtime Redis exception middleware catch’ит failure и выполняет все те же rules через отдельный in-memory fallback store. Thresholds не меняются.
- Локальные counters являются process-local и не копируются обратно в Redis.
- На каждом следующем sensitive request middleware снова вызывает primary Redis store. После полностью успешного `Promise.all` mode автоматически возвращается в Redis и emits recovery hook.
- `api-hardening.spec.ts` прямо проверяет local emergency enforcement для всех четырёх routes, один degraded transition и автоматический возврат в Redis mode после восстановления store.
- 429 формируется в canonical API error envelope через `createApiErrorResponse`: `TOO_MANY_REQUESTS`, message, path и timestamp. Unit tests проверяют одинаковый public response для IP/account/global limiting levels.
- Production env validation требует `REDIS_URL`, если явно не задан `ALLOW_IN_MEMORY_RATE_LIMIT=true`. `env.spec.ts` покрывает both fail-fast и emergency override.
- При startup production без Redis и с override `main.ts` пишет structured warning `event=rate_limit_in_memory_fallback`, `alert=true` о per-instance/restart-reset semantics.
- При runtime Redis outage, когда Redis client существует, `main.ts` подключает observability hooks: structured `rate_limit_degraded`, `rate_limit_recovered`, `rate_limit_request_total`; при configured `SENTRY_DSN` first degraded transition отправляется через `Sentry.captureException()`.
- Repeated runtime Redis errors не вызывают повторный `modeChanged(local-degraded)` до recovery, потому что middleware хранит per-process `degraded` boolean.
- `.env.production.example` правильно называет `ALLOW_IN_MEMORY_RATE_LIMIT=true` emergency-only escape hatch и предупреждает о потере cross-replica/restart-safe limiting.

### Несоответствия и уточнения

1. **Policy описывает runtime Redis outage, но не отделяет его от startup no-Redis escape hatch.** Это два разных current режима. При runtime outage Redis client существует и middleware пытается Redis снова на каждом sensitive request. При startup с `ALLOW_IN_MEMORY_RATE_LIMIT=true` Redis client вообще не создаётся: in-memory store становится primary с момента bootstrap, поэтому утверждение `Every sensitive request retries Redis` к этому режиму неприменимо.

2. **Startup escape hatch не получает `rate_limit_degraded` / `rate_limit_recovered` / `rate_limit_request_total` hooks.** В `main.ts` `observability` передаётся в middleware только если `redis` truthy. Без `REDIS_URL` middleware работает in-memory, но observability object равен `undefined`. Единственное подтверждённое signal — startup `logger.warn` с `event=rate_limit_in_memory_fallback`.

3. **`rate_limit_request_total` назван metric event сильнее, чем подтверждает код.** Current implementation пишет structured Pino log object `{ event: 'rate_limit_request_total', mode, route, value: 1 }`. Отдельный metrics exporter/counter backend (Prometheus/OpenTelemetry/StatsD и т.п.) для этого event в проверенном коде не подтверждён. Корректнее называть его structured log event, пока нет metrics pipeline.

4. **Фраза `Alerting must page on rate_limit_degraded` — operational requirement, а не machine-enforced current behavior.** Код подтверждает error-level structured log с `alert=true` и optional Sentry exception. Alert rule/pager integration, on-call routing и automatic resolution rule repository config не обнаружены.

5. **Readiness semantics не описаны.** Если `REDIS_URL` настроен, но Redis падает, rate-limit middleware продолжает bounded local-degraded protection, однако `RedisHealthService.checkReadiness()` ping’ует Redis и `/api/v1/health/ready` становится 503. То есть security fallback позволяет обработать sensitive request, но deployment/load-balancer может одновременно вывести instance из readiness.

6. **Startup override имеет другую readiness semantics.** Если production запущен без `REDIS_URL` через `ALLOW_IN_MEMORY_RATE_LIMIT=true`, `RedisHealthService` возвращает `disabled`, а readiness может оставаться 200 при healthy DB/storage. Policy не объясняет, что `redis: disabled` в этом случае означает intentionally degraded security topology, а не runtime Redis outage.

7. **`Do not scale out API instances as a mitigation` корректен для local counters, но взаимодействие с platform orchestration сложнее.** При runtime Redis outage readiness 503 может само по себе вызвать traffic draining/restarts в зависимости от Railway behavior. Policy должен различать manual scale-out запрет и automated healthcheck response; live Railway reaction на 503 здесь не подтверждена.

8. **Local fallback “same limits” верен по thresholds, но distributed semantics не те же.** Документ это частично говорит, однако стоит явно перечислить: global counter становится global только внутри одного process, per-IP/account counters расходятся между replicas, restart очищает counters. Startup warning это уже описывает точнее самого policy.

9. **Runtime partial Redis increments возможны до fallback.** Rules инкрементируются через `Promise.all`; если один Redis increment уже succeeded, а другой rejected, request затем полностью учитывается local fallback. Local counters обратно не копируются, но Redis может сохранить частичное увеличение некоторых keys. После recovery это способно временно дать более консервативный distributed count. Это fail-safe, а не bypass, но policy сейчас описывает transition как более атомарный на уровне whole request, чем фактически гарантируется.

10. **Sentry capture относится только к runtime Redis store failure.** Startup no-Redis override не вызывает `captureRateLimitFailure`, потому что observability hooks не создаются. Если policy требует pager/Sentry и для knowingly-degraded startup, current implementation этого не обеспечивает автоматически.

11. **Policy не содержит freshness marker.** Failure-mode/security docs чувствительны к middleware/env/health changes; полезно хранить `Verified at` и `Verified against main SHA`.

12. **CI действительно запускает API tests через recursive coverage suite, но отдельного live Redis outage integration test в проверенном workflow нет.** Unit tests эмулируют rejecting store и recovery. Это хорошая behavioral coverage, но не доказательство реального network outage/reconnect behavior ioredis в production environment.

### Что изменить

1. Разделить policy на два explicit modes:
   - `Runtime Redis outage with REDIS_URL configured`;
   - `Emergency startup without Redis via ALLOW_IN_MEMORY_RATE_LIMIT=true`.
2. Для runtime outage сохранить текущий contract: retry Redis each sensitive request, local fallback, one degraded event per process/outage, recovery event on successful Redis request.
3. Для startup override явно написать: Redis retries/recovery events отсутствуют, limiter primary in-memory с самого старта, counters per-instance/restart-reset, startup signal — `rate_limit_in_memory_fallback`.
4. Переименовать `rate_limit_request_total metric event` в `structured log event`, либо добавить реальный metrics backend/exporter и документировать его.
5. Разделить `observable signal` и `alerting enforcement`: log + optional Sentry реализованы; pager/on-call rule должен иметь отдельный provider/config/runbook evidence.
6. Добавить readiness section:
   - configured Redis unavailable → rate limiting falls back locally, `/health/ready` reports Redis unavailable / 503;
   - Redis intentionally absent via override → readiness reports `redis: disabled` и может быть 200.
7. Зафиксировать operational implications readiness 503 отдельно от рекомендации не scale-out’ить вручную; не утверждать Railway restart/drain behavior без provider evidence.
8. Уточнить partial-increment edge case: Redis failure во время multi-rule `Promise.all` может оставить часть Redis counters incremented; fallback всё равно применяет полный local rule set, поэтому это может только ужесточить последующие counts, но не отключает protection.
9. Если startup override должен создавать Sentry/page alert, добавить explicit observability call для `rate_limit_in_memory_fallback` и соответствующий test; иначе документировать, что это только warning log.
10. Добавить tests для startup no-Redis middleware wiring/observability distinction, если этот режим считается production-supported emergency path.
11. Добавить `Verified at` / `Verified against main SHA`.
12. Для production incident runbook ссылаться на `/health/ready`, startup fallback warning и exact events, а live Redis/service state хранить отдельно от code policy.

### [НЕ ПРОВЕРЕНО]

- Live Railway Redis availability, actual `REDIS_URL` и `ALLOW_IN_MEMORY_RATE_LIMIT` values на 2026-08-08.
- Реальные alert rules/pager/Sentry project routing: repository подтверждает только optional Sentry capture hook, не provider configuration.
- Real ioredis network outage/recovery не воспроизводился против живого Redis в рамках этого documentation audit; unit tests используют rejecting/recovering test store.
- Фактическая Railway reaction на `/health/ready` 503 (traffic drain/restart/deploy failure) не проверялась provider API.
- Полный metrics/observability stack вне repository не проверен; вывод `structured log, not confirmed metrics backend` относится только к доступному current code/config.

### Итог

`RATE_LIMIT_FAILURE_POLICY.md` правильно фиксирует ключевой security invariant: **Redis failure не превращает sensitive authentication/registration routes в unbounded fail-open**. Runtime fallback реализован аккуратно и покрыт unit tests. Основной documentation drift — два разных degraded mode слиты в один. Runtime outage имеет retry/recovery/log/Sentry hooks и readiness 503; emergency startup без Redis имеет primary in-memory limiter, `redis: disabled` readiness и только startup warning. После разделения этих режимов и уточнения `structured log` vs real metric/pager policy документ станет точным current failure-mode runbook.
