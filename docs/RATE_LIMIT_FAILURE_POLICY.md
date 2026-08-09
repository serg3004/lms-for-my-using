# Rate Limit Failure Policy

> **Статус:** `CURRENT`
>
> **Назначение:** описать фактическое поведение sensitive-route rate limiting при нормальной работе Redis, runtime Redis outage и explicit startup fallback без Redis.
>
> **Проверено по `main`:** `4585e8b641b65484a6a29d2383d46f259a3e1e15` (2026-08-09).

## 1. Термины и режимы

Документ различает три режима:

1. `REDIS-PRIMARY` — Redis configured и доступен; primary limiter использует Redis.
2. `RUNTIME-DEGRADED` — Redis configured, но запрос к Redis падает во время работы; sensitive route использует локальный in-memory fallback для этого запроса/процесса.
3. `STARTUP-IN-MEMORY` — Redis intentionally отсутствует, а `ALLOW_IN_MEMORY_RATE_LIMIT=true`; приложение запускается с in-memory limiter как primary implementation.

`RUNTIME-DEGRADED` и `STARTUP-IN-MEMORY` — разные operational states и `MUST NOT` описываться как одно и то же поведение.

---

## 2. Где применяется sensitive-route limiting

**Статус:** `IMPLEMENTED`

Current hardening middleware защищает sensitive flows, включая:

- login;
- password reset request;
- password reset confirm;
- organization registration.

Policy использует комбинацию global/IP/account-style keys в зависимости от route и сохраняет текущие thresholds независимо от того, Redis primary или local fallback выполняет check.

---

## 3. Нормальный режим: `REDIS-PRIMARY`

**Статус:** `IMPLEMENTED`

Если Redis configured и доступен:

- limiter выполняет Redis operations;
- Redis является shared state между API processes/instances;
- readiness Redis check ожидает доступность configured Redis;
- sensitive-route decisions используют Redis-backed counters.

Это preferred production mode.

---

## 4. Runtime Redis outage: `RUNTIME-DEGRADED`

**Статус:** `IMPLEMENTED`

Если Redis configured, но конкретная limiter operation завершается ошибкой:

1. запрос **не становится unbounded fail-open**;
2. middleware переключает проверку на local in-memory fallback;
3. fallback использует те же configured limits/window semantics для соответствующего limiter;
4. последующие запросы снова пытаются использовать Redis — permanent switch не происходит;
5. при восстановлении Redis primary path снова начинает работать.

### Observability этого режима

Runtime-degraded path имеет специальные hooks/log events для degraded/recovered/request outcomes и может отправлять exception/event в optional Sentry integration, если она configured.

Это относится именно к Redis-configured runtime path.

### Ограничение local fallback

In-memory fallback существует отдельно в каждом process/instance. Он не является distributed limiter и не даёт глобальную консистентность Redis-backed counters.

**Вывод:** runtime outage остаётся bounded на уровне отдельного процесса, но уровень защиты weaker, чем shared Redis primary.

---

## 5. Startup без Redis: `STARTUP-IN-MEMORY`

**Статус:** `IMPLEMENTED`, но только при explicit opt-in.

Production env validation требует Redis, если не выставлено:

`ALLOW_IN_MEMORY_RATE_LIMIT=true`

При explicit fallback:

- Redis client/Redis limiter не создаётся как primary dependency;
- in-memory limiter используется с самого старта;
- приложение пишет startup warning;
- runtime Redis degraded/recovered hooks отсутствуют, потому что Redis path не активирован;
- readiness может показывать Redis как `disabled`, а не `error`.

**Важно:** этот режим предназначен как explicit emergency/degraded operation, а не как equivalent replacement distributed Redis limiting.

---

## 6. Readiness consequences

### Redis configured, но недоступен

**Статус:** `NOT-READY`

Sensitive routes могут продолжать обслуживаться через local fallback, однако Redis readiness check возвращает failure, и `/api/v1/health/ready` должен быть 503.

Это сознательное различие:

- availability sensitive endpoint может сохраняться;
- deployment/readiness сообщает, что configured dependency degraded.

### Redis intentionally disabled через explicit fallback

**Статус:** `TECHNICALLY-READY` возможен

Readiness может вернуть `redis: disabled`, и endpoint может остаться 200, если остальные required/configured dependencies healthy.

Это **не означает**, что production security posture эквивалентен Redis-backed distributed limiting.

---

## 7. Fail-open / fail-closed terminology

Нельзя описывать current policy просто как `fail-open` или `fail-closed` без уточнения уровня.

### Runtime request availability

При Redis error sensitive route может продолжить работу через bounded local limiter — то есть Redis failure сам по себе не закрывает endpoint полностью.

### Abuse-control enforcement

Limiter не становится unlimited: local threshold check остаётся активным.

### Distributed enforcement

Distributed/shared state теряется, пока используется in-memory fallback.

Поэтому точная формулировка:

> Redis failure degrades distributed rate limiting to a bounded per-process local limiter; it does not intentionally disable rate limiting.

---

## 8. Counter consistency during failure

**Статус:** `BEST-EFFORT`

Redis operation может частично успеть изменить remote state до ошибки, после чего текущий request проходит local fallback evaluation.

Следовательно нельзя гарантировать идеальную синхронизацию Redis и local counters во время partial failures.

Это предпочтительнее полного bypass, но документация не должна обещать strict exactly-once/global counter semantics при Redis outage.

---

## 9. Logging, metrics и alerting

### Structured logging

**Статус:** `IMPLEMENTED`

Rate-limit code создаёт structured log events, включая degraded/recovered/request outcomes.

Название события/поля вроде `rate_limit_request_total` в log payload не является доказательством наличия отдельного Prometheus/metrics backend.

### Sentry

**Статус:** `PARTIAL` / `LIVE-VERIFY`

Code содержит optional Sentry hooks. Фактическая Sentry configuration/delivery требует live verification.

### Pager/on-call alerts

**Статус:** `LIVE-VERIFY`

Repository не подтверждает настроенный pager/on-call routing для rate-limit degradation.

**Правило для ИИ:** `MUST NOT` утверждать, что degradation автоматически paging-ит on-call, если нет fresh external evidence.

---

## 10. Тестовое покрытие policy

**Статус:** `IMPLEMENTED`

`apps/api/src/common/middleware/api-hardening.spec.ts` покрывает ключевые сценарии, включая:

- Redis-backed decisions;
- Redis failure → local fallback;
- recovery обратно к Redis;
- sensitive route limits;
- relevant degraded behavior.

Тесты подтверждают code semantics, но не live multi-instance behavior в production.

---

## 11. Operational interpretation

### Preferred production state

`REDIS-PRIMARY` + healthy readiness.

### Temporary runtime incident

`RUNTIME-DEGRADED`:

- endpoint availability может сохраниться;
- per-process limiting остаётся;
- readiness red;
- distributed protection degraded;
- требуется operational investigation.

### Explicit emergency startup

`STARTUP-IN-MEMORY`:

- разрешён только explicit env flag;
- technical readiness может быть green с `redis: disabled`;
- это accepted degraded mode, а не proof полной production security readiness.

---

## 12. Правила для ИИ-агента

1. `MUST` различать runtime outage и startup-without-Redis.
2. `MUST NOT` писать, что Redis failure полностью отключает rate limiting.
3. `MUST NOT` писать, что local fallback обеспечивает distributed/global limits.
4. `MUST` указывать readiness 503 для configured-but-down Redis.
5. `MUST` указывать возможность `redis: disabled` для explicit in-memory startup mode.
6. `MUST NOT` считать structured log field полноценной metrics backend integration без evidence.
7. `MUST NOT` считать optional Sentry hook или log автоматическим pager alert.
8. `LIVE-VERIFY` нужен для Redis topology/availability, Sentry delivery и alert routing.

## Связанные документы

- `docs/READINESS_AND_SECURITY_GATES.md`
- `docs/CI_AUDIT_BASELINE.md`
- `docs/PROJECT_SOURCE_OF_TRUTH.md`
