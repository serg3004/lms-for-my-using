# Open Decisions

> **Статус:** `CURRENT`.
>
> **Назначение:** единственный writable Markdown-регистр только для owner/business decisions. Active implementation work принадлежит GitHub Issues/Project, live infrastructure state — fresh read-back/evidence.
>
> Решение закрывается только владельцем. ИИ-агент не должен превращать незакрытый decision в implementation requirement.

## DEC-ORG-001 — Future organization structure / Departments / HRIS

**Источник:** `TV-020 / TV-056`, historical org-structure plans.

Текущая Group/team model реализована. Необходимо решить product scope будущей Department/HRIS hierarchy и требуется ли её вообще добавлять.

## DEC-MVP-001 — General Audit Log MVP disposition

**Источник:** `TV-024`, historical hardening/recommendation trackers.

General Audit Log уже реализован. Требуется только owner decision: `REQUIRED_FOR_MVP`, `POST_MVP` или `REMOVED_FROM_MVP` как product-gate classification.

## DEC-AUTH-001 — Invite lifecycle

**Источник:** `TV-030`.

Current admin-created user flow существует. Требуется решить, нужен ли отдельный invite lifecycle, его states и delivery semantics.

## DEC-INFRA-001 — Redis requirement / degraded-mode policy

**Источник:** `TV-032`, historical Redis concern/hardening item.

Код поддерживает Redis-backed rate limiting и explicit in-memory degraded mode. Требуется определить acceptable production policy: Redis обязателен или degraded mode допустим при явном operational acceptance. Фактическое live Redis state проверяется отдельно.

## DEC-MVP-002 — Notifications MVP disposition

**Источник:** `TV-047`.

Notifications уже реализованы. Требуется только owner decision по их product/MVP classification.

## DEC-MAIL-001 — Delivery provider and delivery requirements

**Источник:** `TV-048`.

Provider-neutral delivery hook реализован. Требуется выбрать provider/operational requirement и определить, какой delivery SLA нужен продукту. Live delivery проверяется отдельно.

## DEC-OPS-001 — Backup / PITR / restore policy level

**Источник:** `TV-054`, `H-013`.

Нужно определить accepted retention/PITR/restore policy и обязательность регулярного restore drill. Наличие конкретных live backups/restore evidence проверяется отдельно.

## DEC-UX-001 — Learner-facing course category UX

**Источник:** `RECOMMENDATIONS R2.1`.

Backend/type category contract существует. Требуется решить, нужна ли category presentation/filtering в current product scope.

## DEC-UX-002 — Next lesson guidance

**Источник:** `RECOMMENDATIONS R2.3`, `H-004`.

Canonical `nextLesson` field/UX не утверждён. До решения не создавать implementation task на основании старой рекомендации.

## DEC-MSG-001 — Manager messaging capability

**Источник:** `RECOMMENDATIONS R3`.

Нужно выбрать между email notification, in-app messaging/Notifications или отсутствием отдельной messaging capability. Historical prototype не является достаточным основанием для Message model/API/UI.

## DEC-RBAC-001 — Fixed roles vs custom roles

**Источник:** historical `CONCERNS` entry for Admin → Roles.

Current role model фиксированный. Требуется решить, нужны ли custom roles как отдельная product capability; UI-кнопка «Создать роль» не должна появляться без такого решения и backend contract.

## DEC-DS-001 — Primary/accent badge variant

**Источник:** historical `CONCERNS` entry for Admin → Roles.

Решить, нужен ли системный `primary/accent` badge variant или neutral badge остаётся canonical design choice.

## DEC-SEC-001 — Security waiver validation strictness

**Источник:** `H-008`.

Current waiver validator проверяет обязательные поля, uniqueness, date regex и lexical expiry. Усиление CVE/date semantics выполняется только если owner/security policy этого требует.

## DEC-CHKS-001 — Workplace-training session critical/low performance thresholds

**Источник:** `docs/product/future/CHECKLIST_WORKPLACE_TRAINING_IMPLEMENTATION_PLAN.md` (PR 285/286),
`docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md`.

`ChecklistWorkplaceSettings` (PR 286) ships `moduleEnabled=false` и `highPerformanceThreshold=90` как safe defaults.
`criticalThreshold`/`lowThreshold` намеренно не заданы — что считается «критическим» результатом наблюдаемой
сессии, product-решение, а не техническая деталь. До решения PR 286 не показывает critical/low band в settings UI.

## DEC-CHKS-002 — Workplace-training session data retention policy

**Источник:** `docs/product/future/CHECKLIST_WORKPLACE_TRAINING_IMPLEMENTATION_PLAN.md` (PR 304).

Checklist-session данные (location captures с exact coordinates, photo evidence, session timeline/audit trail)
хранятся бессрочно — retention/deletion policy не задана. Требуется owner-решение: retention period для exact
coordinates и photo evidence, нужен ли separate retention для audit log (`AuditLog`/`ChecklistSessionEvent`), и
какой механизм удаления (scheduled job, manual admin action, per-organization override). До решения retention
hooks/config/scheduled deletion не реализуются — release blocker для отдельного retention feature, но не для
PR 304 (audit trail и access scoping не зависят от retention period).

## Deferred, не open decisions

Load-test release gate остаётся deferred до появления конкретной цели по нагрузке, dataset, latency/error thresholds и environment. Не считать его implementation obligation без отдельного решения.
