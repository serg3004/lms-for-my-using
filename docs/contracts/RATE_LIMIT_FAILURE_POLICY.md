# Rate Limit Failure Policy

> **Статус:** `CURRENT`
>
> **Назначение:** описать фактическое поведение sensitive-route rate limiting при нормальной работе Redis, runtime Redis outage и explicit startup fallback без Redis.
>
> **Актуализировано для PR 224:** 2026-08-24.

## 1. Термины и режимы

Документ различает три режима:

1. `REDIS-PRIMARY` — Redis configured и доступен; primary limiter использует Redis.
2. `RUNTIME-FAIL-CLOSED` — Redis configured, но запрос к Redis падает во время работы; security-critical sensitive route отклоняется с `503 RATE_LIMIT_UNAVAILABLE`.
3. `STARTUP-IN-MEMORY` — Redis intentionally отсутствует, а `ALLOW_IN_MEMORY_RATE_LIMIT=true`; приложение запускается с in-memory limiter как primary implementation.

`RUNTIME-FAIL-CLOSED` и `STARTUP-IN-MEMORY` — разные operational states и `MUST NOT` описываться как одно и то же поведение.

---

## 2. Где применяется sensitive-route limiting

**Статус:** `IMPLEMENTED`

Current hardening middleware защищает sensitive flows, включая:

- login;
- password reset request;
- password reset confirm;
- organization registration.

Policy использует комбинацию global/IP/account-style keys в зависимости от route. Thresholds применяются через shared Redis в normal mode и через intentional in-memory store только в explicit `STARTUP-IN-MEMORY`.

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

## 4. Runtime Redis outage: `RUNTIME-FAIL-CLOSED`

**Статус:** `IMPLEMENTED`

Если configured Redis operation завершается ошибкой, login, password-reset request/confirm и organization registration отклоняются с нормализованным `503 RATE_LIMIT_UNAVAILABLE` и `Retry-After: 1`. Middleware повторяет Redis operation на следующем запросе и автоматически возвращается в `REDIS-PRIMARY` после восстановления. Локальный counter в этом runtime path не используется: одинаковое fail-closed решение на каждой API replica не позволяет умножить эффективный лимит числом instances.

Обычные API routes не проходят через sensitive limiter и остаются доступны; общий readiness configured Redis при этом остаётся `503`. Это отделяет security-critical fail-safe policy от availability обычного API.

### Observability этого режима

Первый сбой перехода пишет structured event `rate_limit_fail_closed` без request body, credentials или Redis URL, увеличивает `lms_redis_errors_total{component="rate_limiter"}` и может быть отправлен в configured Sentry. Каждый отклонённый запрос увеличивает `lms_rate_limit_rejects_total{mode="redis-unavailable",route=...}`. Восстановление пишет `rate_limit_recovered`. Фактическая доставка alerts остаётся `LIVE-VERIFY`.

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

Sensitive routes fail closed с `503 RATE_LIMIT_UNAVAILABLE`; Redis readiness check также возвращает failure, и `/api/v1/health/ready` должен быть 503. Обычные API routes этим middleware не блокируются.

Это сознательное различие:

- sensitive endpoint явно недоступен с retryable `503`;
- deployment/readiness сообщает, что configured dependency degraded.

### Redis intentionally disabled через explicit fallback

**Статус:** `TECHNICALLY-READY` возможен

Readiness может вернуть `redis: disabled`, и endpoint может остаться 200, если остальные required/configured dependencies healthy.

Это **не означает**, что production security posture эквивалентен Redis-backed distributed limiting.

---

## 7. Fail-open / fail-closed terminology

При configured Redis runtime failure security-critical sensitive routes работают **fail-closed**. Это сохраняет единую политику между replicas ценой временной недоступности auth/registration flows. `STARTUP-IN-MEMORY` остаётся отдельным explicit emergency режимом: он разрешён только через `ALLOW_IN_MEMORY_RATE_LIMIT=true` и не обеспечивает distributed limits.

---

## 8. Counter consistency during failure

**Статус:** `FAIL-CLOSED`

Redis operation может успеть частично изменить remote counter до ошибки, но запрос всё равно отклоняется. После recovery атомарный Lua `INCR` + conditional `PEXPIRE` остаётся источником shared counters; middleware не пытается объединять local и Redis state.

---

## 9. Logging, metrics и alerting

### Structured logging

**Статус:** `IMPLEMENTED`

Rate-limit code создаёт structured log events, включая fail-closed/recovered/request outcomes.

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
- Redis failure → fail-closed `503` на всех sensitive routes;
- recovery обратно к Redis;
- sensitive route limits;
- relevant degraded behavior.

Тесты подтверждают code semantics, но не live multi-instance behavior в production.

---

## 11. Operational interpretation

### Preferred production state

`REDIS-PRIMARY` + healthy readiness.

### Temporary runtime incident

`RUNTIME-FAIL-CLOSED`:

- sensitive endpoint возвращает `503 RATE_LIMIT_UNAVAILABLE`;
- ordinary API routes остаются доступны;
- readiness red;
- каждая replica принимает одинаковое fail-closed решение;
- требуется operational investigation.

### Explicit emergency startup

`STARTUP-IN-MEMORY`:

- разрешён только explicit env flag;
- technical readiness может быть green с `redis: disabled`;
- это accepted degraded mode, а не proof полной production security readiness.

---

## 12. Правила для ИИ-агента

1. `MUST` различать runtime outage и startup-without-Redis.
2. `MUST` указывать fail-closed `503` для sensitive routes при configured Redis failure.
3. `MUST NOT` смешивать runtime fail-closed с explicit `STARTUP-IN-MEMORY`.
4. `MUST` указывать readiness 503 для configured-but-down Redis.
5. `MUST` указывать возможность `redis: disabled` для explicit in-memory startup mode.
6. `MUST NOT` считать structured log field полноценной metrics backend integration без evidence.
7. `MUST NOT` считать optional Sentry hook или log автоматическим pager alert.
8. `LIVE-VERIFY` нужен для Redis topology/availability, Sentry delivery и alert routing.

## Связанные документы

- `docs/quality/READINESS_AND_SECURITY_GATES.md`
- `docs/evidence/audits/CI_AUDIT_BASELINE.md`
- `docs/README.md`
- `docs/_meta/ownership.json`