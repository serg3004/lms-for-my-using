# MVP Readiness Dashboard

> **Статус:** `CURRENT` summary only.
>
> **Назначение:** кратко показывать repository readiness и отделять её от live/owner decisions. Этот файл не является source of truth для API/module inventories.
>
> **Reconciled against `main`:** `cbeecd860717c2b8df9c821c1cd7bad323ad3b0e` (2026-08-26).

## Status language

- `READY` — repository implementation подтверждена.
- `PARTIAL` — остаётся implementation/operational gap.
- `OWNER-DECISION` — требуется product/ops решение владельца.
- `LIVE-VERIFY` — current external state требует fresh evidence.
- `HISTORICAL` — snapshot, не current readiness.

`READY` в repository не означает автоматически production `GO`.

## Repository readiness

| Область | Статус | Комментарий |
|---|---|---|
| Core backend MVP surface | `READY` | Current API содержит core learning/admin/manager flows; API surface проверять по runtime OpenAPI/controllers. |
| Core Web role surfaces | `READY` / `PARTIAL` | Основные role surfaces существуют; отдельные UX gaps ведутся как GitHub Issues. |
| Auth/session | `READY` | Server-side sessions, refresh rotation/revocation, logout/logout-all и password-reset flow реализованы. |
| RBAC/tenant scoping | `READY` / `PARTIAL` | Role policies/guards существуют; manager/group object-scope security finding ведётся как GitHub Issue #725. |
| API error semantics | `READY` | Current shared/runtime error layer является authority. |
| Runtime OpenAPI | `READY` | `/api/v1/api-json` + controllers — authority; manual route inventories не поддерживаются как current truth. |
| CI implementation | `READY` | Workflows существуют; required-check/ruleset enforcement всегда `LIVE-VERIFY`. |
| Storage/upload code contract | `READY` | S3-compatible upload/download/quarantine/scanner integration реализованы; provider state отдельно. |
| Password reset code | `READY` | Старый intentional `503` historical; live delivery provider остаётся verification concern. |
| Notifications implementation | `READY` | `NotificationsModule`/model/API/UI существуют. MVP disposition — `OWNER-DECISION`. |
| General Audit Log implementation | `READY` | `AuditLogModule`/model/admin API/UI существуют. MVP disposition — `OWNER-DECISION`. |
| Basic reporting | `PARTIAL` | Core reporting surfaces есть; advanced universal reporting не является current implementation baseline. |

## Live/operations readiness

Всегда проверять свежими evidence/live read-back:

- Railway topology/domains/deployment state;
- Redis availability/degraded mode;
- S3 provider/bucket/CORS/lifecycle;
- malware scanner availability;
- cleanup scheduling;
- Sentry/alerts;
- backups/PITR/restore readiness;
- production smoke;
- GitHub ruleset/branch protection/required checks.

Dated production verification files сохраняют observed snapshot, но не обновляют этот dashboard автоматически.

## Owner decisions

Canonical source unresolved owner/business decisions — `docs/status/OPEN_DECISIONS.md`.

Ключевые unresolved decisions после reconciliation:

- Notifications MVP disposition;
- General Audit Log MVP disposition;
- invite lifecycle;
- production Redis/degraded-mode acceptance;
- email/delivery provider;
- backup/PITR acceptance;
- organization-structure expansion scope.

Наличие уже реализованных Notifications/Audit Log не закрывает их product disposition автоматически.

## Source precedence

1. `docs/README.md` — ownership/governance.
2. Canonical code/config/runtime owner-source — implementation fact.
3. `docs/product/MVP_SCOPE_LOCK.md` — MVP boundaries.
4. `docs/status/OPEN_DECISIONS.md` — unresolved owner/business decisions.
5. GitHub Issues/Project — active implementation work.
6. Dated evidence — what was observed then.
7. This dashboard — summary only.

Historical smoke/status docs do not override current owner-sources.
