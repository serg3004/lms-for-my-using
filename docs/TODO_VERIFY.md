# TODO_VERIFY — open decision / live verification registry

> **Статус:** `CURRENT` transitional registry until DOC-08/DOC-12.
>
> **Назначение:** хранить только действительно открытые решения и live verification. Repository facts с известным ответом здесь не дублируются.
>
> **Reconciled against `main`:** `cbeecd860717c2b8df9c821c1cd7bad323ad3b0e` (2026-08-26).

## Правила

- `OWNER-DECISION` — требуется решение владельца; ИИ-агент не выбирает вариант самостоятельно.
- `LIVE-VERIFY` — требуется fresh external/platform evidence.
- Если ответ подтверждён current code/config/tests, пункт не остаётся TODO только ради истории.
- Implementation status не меняет product scope автоматически.

## Open items

| ID | Topic | Decision / live status | Current implementation fact | Что остаётся открытым |
|---|---|---|---|---|
| TV-008 | Production object storage | `LIVE-VERIFY` | S3-compatible storage contract реализован | Current provider/bucket/CORS/lifecycle state проверять live; dated PR evidence не является вечной truth. |
| TV-020 / TV-056 | Organization structure overhaul | `OWNER-DECISION` | Current groups/team model существует; отдельный planned Department/HRIS scope не реализован | Выбрать product scope. Future PR numbering в planning docs будет мигрирован на DOC-08. Security finding по manager/group scope сохраняется отдельным work item и не зависит от product expansion. |
| TV-024 | General Audit Log MVP disposition | `OWNER-DECISION` | **IMPLEMENTED:** `AuditLogModule`, Prisma `AuditLog`, admin API/UI существуют | `REQUIRED_FOR_MVP` / `POST_MVP` / `REMOVED_FROM_MVP`. Старый claim «общего audit module нет» закрыт как stale. |
| TV-030 | Invite lifecycle | `OWNER-DECISION` | Admin-created user flow существует | Нужен ли отдельный invite lifecycle и когда. |
| TV-032 | Production Redis/degraded mode | `OWNER-DECISION` + `LIVE-VERIFY` | Redis-capable rate limiting с in-memory fallback реализован | Fresh live Redis state и решение: provision Redis или принять degraded mode. |
| TV-047 | Notifications MVP disposition | `OWNER-DECISION` | **IMPLEMENTED:** `NotificationsModule`, Prisma `Notification`, learner notifications API/UI существуют | `REQUIRED_FOR_MVP` / `POST_MVP` / `REMOVED_FROM_MVP`. Старый claim `NOT-IMPLEMENTED` закрыт как stale. |
| TV-048 | Email/delivery provider | `OWNER-DECISION` + `LIVE-VERIFY` | Password-reset request/confirm и provider-neutral delivery hook реализованы | Выбрать/подтвердить provider и live delivery requirements. Старый password-reset `503` — historical only. |
| TV-054 | Backups / PITR / restore | `OWNER-DECISION` + `LIVE-VERIFY` | Repository policy/runbooks существуют | Подтвердить accepted policy и fresh provider/restore evidence. |
| TV-055 | Observability | `LIVE-VERIFY` | Logging/metrics/hooks существуют в repository | Fresh Sentry/alert routing/operational evidence. |

## Закрытые factual corrections DOC-02

Следующие старые claims больше не являются open TODO:

- Notifications отсутствуют — **stale**, implementation подтверждён.
- Dedicated/general Audit Log отсутствует — **stale**, implementation подтверждён.
- Password reset намеренно возвращает `503` — **historical**, current request/confirm flow реализован.
- DB migrations «не применялись» — **не current claim**; repository deploy выполняет `prisma migrate deploy`, а deployment outcome является dated/live evidence.
- Static GitHub protection/workflow inventory — **не хранить здесь**; проверять live.

## Migration note

На DOC-08 active implementation work переедет в GitHub Issues, а owner/business decisions — в целевой decision/status документ. На DOC-12 этот mixed transitional registry должен быть retired после подтверждения mapping всех оставшихся пунктов.
