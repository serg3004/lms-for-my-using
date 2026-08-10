# Production Hardening Backlog

> **Статус:** `CURRENT`
>
> **Назначение:** хранить только актуальные hardening/operations gaps. Закрытые исторические пункты остаются как provenance, но не должны выглядеть как open work.
>
> **Проверено по `main`:** `4f4ae9fc941ec52b51aaeffef994162d256dd8fa` (2026-08-10).

## 1. Статусы

- `DONE` — подтверждено current repository code/config/tests.
- `PARTIAL` — часть hardening реализована, остаётся конкретный gap.
- `OPEN` — работа действительно отсутствует/не завершена.
- `DEFERRED` — сознательно отложено.
- `OWNER-DECISION` — требуется решение владельца.
- `LIVE-VERIFY` — repository не может подтвердить live infrastructure state.
- `HISTORICAL` — старый backlog item / internal PR marker; не current task.

**Правило для ИИ-агента:** старые номера `PR 104…137` в этом документе — внутренние planning IDs, а не гарантия соответствия GitHub PR numbers.

---

## 2. Закрытый hardening baseline

Следующие области больше не являются open backlog:

| Область | Статус | Current evidence |
|---|---|---|
| CI baseline: lint/typecheck/tests/build | `DONE` | `.github/workflows/ci.yml` |
| Dependency audit + Gitleaks | `DONE` | `.github/workflows/ci.yml` |
| CodeQL JS/TS | `DONE` | `.github/workflows/codeql.yml` |
| Refresh/session store | `DONE` | current auth/session implementation |
| Session revocation/logout-all | `DONE` | current auth controller/service |
| JWT implementation on `jose` | `DONE` | current auth token implementation |
| Upload validation | `DONE` | upload validation/service tests |
| Buffered + multipart upload | `DONE` | current upload module/Web helper |
| Quarantine/malware callback integration | `DONE` | current upload service/code contract |
| Playwright/browser E2E baseline | `DONE` | current CI/E2E suite |
| Structured logging | `DONE` | current API logging integration |
| Dependabot baseline | `DONE` | `.github/dependabot.yml` |

Historical internal planning IDs for these items are retained only for traceability and must not be used as open-work instructions.

---

## 3. Current P0 — proven implementation gaps

### H-001 — Health readiness 503 HTTP contract

**Статус:** `DONE`

`HealthController` формирует failed readiness response сразу в canonical API error shape, а global `ApiExceptionFilter` сохраняет dependency statuses на public HTTP boundary.

Current contract:

- HTTP `503`;
- `error.code = HEALTH_CHECK_FAILED`;
- `error.message = Readiness check failed`;
- `error.details` содержит статусы `db`, `redis`, `storage` как `DEPENDENCY_STATUS`;
- HTTP-level integration test проверяет `/api/v1/health/ready` и compatibility `/api/v1/health` через global exception filter;
- internal dependency error messages не попадают в public response.

See `docs/READINESS_AND_SECURITY_GATES.md`.

### H-002 — Instructor assignment role validation

**Статус:** `OPEN`

Course instructor assignment currently validates user existence/organization/not-deleted, but role enforcement must be confirmed/fixed so only valid instructors can be assigned.

Required outcome:

- enforce expected instructor role according to canonical RBAC/product decision;
- add negative tests;
- ensure candidate UI does not offer invalid users.

---

## 4. Current P1 — product/UX gaps

### H-003 — Learner course progress accuracy

**Статус:** `OPEN`

Current learner course list does not expose/use an exact per-course lesson completion percentage; historical recommendation for `lessonsCompleted/lessonsTotal` remains unresolved.

Required outcome:

- use an existing backend completion source if contract-compatible, or extend the summary contract minimally;
- render real progress, not lifecycle-derived 0/100 approximation;
- add tests.

### H-004 — Next lesson guidance

**Статус:** `OPEN`

A canonical `nextLesson` summary field/flow is not confirmed.

Required outcome:

- define whether this UX is required;
- if required, implement with deterministic ordering and tests.

### H-005 — Responsive visual guest refresh mock

**Статус:** `OPEN`

Visual guest mocking must cover `/api/v1/auth/refresh` so visual tests are isolated from a real API and do not produce proxy/refused-connection noise.

Required outcome:

- add refresh mock to the guest visual-test fixture;
- keep production auth behavior unchanged.

---

## 5. Current P1 — CI/repository policy gaps

### H-006 — Dependabot workspace coverage

**Статус:** `PARTIAL`

Dependabot is configured, but coverage/grouping must be reconciled for all relevant workspaces, especially `apps/e2e` and `packages/shared`, if they are not explicitly covered by the current configuration.

Required outcome:

- compare `.github/dependabot.yml` against current workspace inventory;
- add only missing directories/groups;
- preserve manageable PR volume.

### H-007 — Branch protection / GitHub Ruleset

**Статус:** `DEFERRED` / `NOT-IMPLEMENTED`

The future configuration is documented in `docs/BRANCH_PROTECTION_FUTURE_WORK.md`.

Current repository setting must not be assumed protected until GitHub settings are verified after activation.

### H-008 — Security waiver validation hardening

**Статус:** `PARTIAL`

Current validator checks required fields, unique IDs, date regex and lexical expiry. It does not validate CVE semantics or full calendar date correctness.

Required outcome only if policy requires stronger validation:

- define accepted waiver ID/date semantics;
- add validator tests;
- avoid creating a broader security bypass mechanism.

---

## 6. Current P2 — operational / live verification

### H-009 — Production Redis state

**Статус:** `LIVE-VERIFY`

Code supports Redis-backed rate limiting plus explicit in-memory fallback. Repository does not prove current live Redis topology/availability.

### H-010 — Malware scanner live integration

**Статус:** `LIVE-VERIFY`

Scanner integration is implemented in code. Provider/service availability, callback configuration and fresh clean/infected end-to-end evidence are external.

### H-011 — Storage provider/CORS/cleanup scheduling

**Статус:** `LIVE-VERIFY`

S3-compatible contract is implemented. Concrete provider, bucket CORS, cleanup scheduling and fresh upload/download/delete smoke require external evidence.

### H-012 — Observability delivery/alert routing

**Статус:** `PARTIAL` / `LIVE-VERIFY`

Structured logging exists and Sentry integration is optional. Live Sentry delivery, alert routing and on-call behavior are not repository-proven.

### H-013 — Backup/PITR/restore drill

**Статус:** `OWNER-DECISION` + `LIVE-VERIFY`

Repository does not prove current backup retention/PITR/restore readiness. Policy and acceptance evidence must be decided/verified separately.

### H-014 — Load testing

**Статус:** `DEFERRED`

No current release requirement establishes a specific 500–1000 concurrent-user load gate. Define realistic roles, dataset, latency/error thresholds and environment before implementing load tests.

---

## 7. Items removed from active backlog

These historical backlog statements are no longer valid as open work:

- “refresh/session store not implemented”;
- “token revocation missing”;
- “custom JWT replacement still pending”;
- “upload service/multipart/presigned URLs missing”;
- “malware scan integration entirely missing”;
- “Dependabot not configured”;
- “Playwright E2E missing”;
- “production observability has no structured logging”.

If regression is suspected, reopen only after current code/config/tests show the capability is actually absent or broken.

---

## 8. Product decisions are not hardening tasks

The following remain canonical `OWNER-DECISION` topics and should not be silently implemented from this backlog:

- Notifications MVP scope;
- General Audit Log MVP scope;
- full invite lifecycle;
- email provider;
- backup/PITR policy level;
- future separate staging topology.

See `docs/TODO_VERIFY.md` and `docs/MVP_SCOPE_LOCK.md`.

---

## 9. Rules for humans and AI agents

1. `MUST` use this file only for current hardening gaps.
2. `MUST NOT` treat historical internal PR numbers as current GitHub PR instructions.
3. `DONE` items may be reopened only with current evidence of regression.
4. `LIVE-VERIFY` cannot be closed by reading env examples or code.
5. `OWNER-DECISION` cannot be resolved autonomously.
6. Implementation changes must update this backlog when they close or materially change an item.

## Связанные документы

- `docs/PROJECT_SOURCE_OF_TRUTH.md`
- `docs/TODO_VERIFY.md`
- `docs/READINESS_AND_SECURITY_GATES.md`
- `docs/BRANCH_PROTECTION_FUTURE_WORK.md`
- `docs/STORAGE_UPLOAD_STATUS.md`
