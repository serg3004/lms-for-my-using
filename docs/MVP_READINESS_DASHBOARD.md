# MVP Readiness Dashboard

> **Статус:** `CURRENT`
>
> **Назначение:** краткий status dashboard. Он не заменяет canonical scope, backlog или live smoke evidence.
>
> **Проверено по `main`:** `35e0a7df530a894585b29ebd985273d36a63f666` (2026-08-09).

## 1. Как читать dashboard

- `READY` — repository implementation для области подтверждён.
- `PARTIAL` — есть конкретный implementation/operational gap.
- `OWNER-DECISION` — требуется решение владельца.
- `LIVE-VERIFY` — current external state не доказан repository.
- `HISTORICAL` — старый snapshot/result, не current readiness evidence.

**Важно:** `READY` в repository не означает автоматически `LIVE-VERIFIED` production.

---

## 2. Repository readiness

| Область | Статус | Комментарий |
|---|---|---|
| Core backend MVP surface | `READY` | Auth, organizations, users, groups, courses, lessons, materials, assignments, progress, assessments, attempts, certificates и manager flows присутствуют. |
| Core Web role surfaces | `READY` / `PARTIAL` | Admin/learner/instructor/manager surfaces существуют; отдельные UX gaps остаются в backlog. |
| Auth/session | `READY` | Access + refresh/session rotation/revocation/logout-all реализованы. |
| RBAC/tenant scoping | `READY` / `PARTIAL` | Core policies/scoping есть; instructor assignment role validation остаётся отдельным proven gap. |
| API error contract | `READY` / `PARTIAL` | Canonical envelope есть; readiness 503 dependency-details HTTP boundary остаётся gap. |
| OpenAPI | `PARTIAL` | OpenAPI infrastructure существует, но manual/static coverage не считать полным runtime contract. |
| CI | `READY` | Lint/typecheck/tests/build/security/container checks запускаются workflow. |
| Merge enforcement | `DEFERRED` | Branch protection/Ruleset пока не реализован; см. future-work doc. |
| Dependency automation | `PARTIAL` | Dependabot есть; workspace coverage/grouping требует reconciliation. |
| Storage/upload code contract | `READY` | S3-compatible buffered/multipart/private/quarantine/scanner integration реализованы. |
| Password reset | `PARTIAL` | Skeleton endpoints существуют; delivery/provider намеренно не завершены. |
| Notifications | `OWNER-DECISION` | Current module отсутствует; MVP disposition не выбрана владельцем. |
| General Audit Log | `OWNER-DECISION` | Universal domain-wide audit log не подтверждён; product scope не закрыт. |
| Basic reporting | `PARTIAL` | Reporting capability распределена по существующим surfaces, отдельный reports domain не обязателен current scope. |

---

## 3. Live/operations readiness

Все строки ниже требуют fresh external evidence и **не могут быть автоматически зелёными из repository state**.

| Область | Статус | Что требуется для закрытия |
|---|---|---|
| Railway topology/domains | `LIVE-VERIFY` | Fresh deployment/service evidence. |
| Redis production availability | `LIVE-VERIFY` | Current configured/live Redis evidence. |
| S3-compatible provider/bucket/CORS | `LIVE-VERIFY` | Provider/bucket/CORS + smoke evidence. |
| Malware scanner service | `LIVE-VERIFY` | Reachability + callback + clean/infected flow evidence. |
| Cleanup scheduling | `LIVE-VERIFY` | Actual scheduler/last-run evidence. |
| Sentry/alert routing | `LIVE-VERIFY` | Delivery/alerting evidence. |
| Backups/PITR/restore | `OWNER-DECISION` + `LIVE-VERIFY` | Accepted policy + provider/restore evidence. |
| Production smoke | `LIVE-VERIFY` | Fresh smoke on relevant deployment/SHA. |

Historical Railway URLs, provider names and old smoke results must not be copied here as current facts.

---

## 4. Current proven implementation gaps

### Blocking/important engineering gaps

1. Health readiness 503 public HTTP contract.
2. Instructor assignment role validation/candidate filtering.
3. Learner exact course-progress representation.
4. Guest visual-test refresh isolation.
5. Dependabot workspace coverage reconciliation.

`nextLesson` remains an open UX recommendation, not necessarily a release blocker until scope says so.

See `docs/PRODUCTION_HARDENING_BACKLOG.md` and `docs/RECOMMENDATIONS.md`.

---

## 5. Current owner decisions

The dashboard does not guess these decisions:

- Notifications: `REQUIRED_FOR_MVP` / `POST_MVP` / `REMOVED_FROM_MVP`.
- General Audit Log: `REQUIRED_FOR_MVP` / `POST_MVP` / `REMOVED_FROM_MVP`.
- full invite lifecycle;
- email provider;
- backup/PITR acceptance policy;
- future separate Railway staging topology.

See `docs/TODO_VERIFY.md`.

---

## 6. Pilot interpretation

This dashboard does **not** declare “GO today”.

A controlled pilot decision must be made from fresh evidence using `docs/PILOT_CHECKLIST.md`.

Minimum interpretation:

- relevant CI/CodeQL on pilot SHA green;
- pilot scope/known risks accepted;
- no unresolved blocker affecting the pilot scenario;
- required live dependencies verified for the pilot environment;
- fresh smoke completed where production/live use is intended.

---

## 7. Source precedence

Use:

1. `docs/PROJECT_SOURCE_OF_TRUTH.md` — implementation/source rules;
2. `docs/MVP_SCOPE_LOCK.md` — MVP boundaries;
3. `docs/TODO_VERIFY.md` — decision/implementation/live registry;
4. `docs/PRODUCTION_HARDENING_BACKLOG.md` — active hardening gaps;
5. this dashboard — summary only.

Historical smoke/status docs do not override these current sources.

---

## 8. Rules for humans and AI agents

1. `MUST NOT` copy historical production/live claims into this dashboard without fresh evidence.
2. `MUST NOT` call CI `MERGE-ENFORCED` while branch protection remains deferred.
3. `MUST` distinguish repository readiness and live readiness.
4. `MUST` update the affected row when a current gap/owner decision changes status.
5. `MUST NOT` infer MinIO, Redis, staging, backups or live domains from old reports.
