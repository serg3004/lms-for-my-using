# MVP Scope Lock

> **Статус:** `CURRENT`
>
> **Назначение:** фиксировать product/MVP boundaries отдельно от implementation status.
>
> **Reconciled against `main`:** `cbeecd860717c2b8df9c821c1cd7bad323ad3b0e` (2026-08-26).

## 1. Правило

Scope decision и факт реализации — разные вещи. Наличие capability в code не делает её автоматически обязательной для MVP; отсутствие реализации не меняет scope без отдельного решения.

Для implementation facts использовать owner-sources из `docs/README.md`.

## 2. IN-MVP

- Organizations / tenant boundary.
- Users and fixed role model.
- Groups/team management.
- Courses and lessons.
- Course materials/uploads.
- Learner progress.
- Assessments and attempts.
- Assignments/submissions.
- Certificates.
- Core admin/manager/instructor/learner Web workflows.
- Authentication/session lifecycle and RBAC.
- Basic operational readiness/security necessary to run the MVP.

Current code также содержит роль `mentor`; допустимый role set сверяется по Prisma/shared owner-sources, а не по этому списку.

## 3. OUT-OF-MVP

Без отдельного изменения scope:

- AI tutor / RAG / AI course builder;
- native mobile application;
- SCORM/xAPI/LTI runtime support;
- SSO/SAML;
- billing/payments;
- advanced BI/analytics platform;
- drag-and-drop visual course builder;
- custom role builder;
- push notifications;
- universal advanced analytics/export platform.

## 4. Open scope decisions

### Notifications

**Scope:** `OWNER-DECISION`
**Implementation:** `IMPLEMENTED` on reconciled snapshot.

Current repository содержит `NotificationsModule`, `Notification` model и learner notifications UI/API. Это закрывает старый factual claim `NOT-IMPLEMENTED`, но не решает product disposition.

Владелец должен выбрать: `REQUIRED_FOR_MVP` / `POST_MVP` / `REMOVED_FROM_MVP`.

### General Audit Log

**Scope:** `OWNER-DECISION`
**Implementation:** `IMPLEMENTED` on reconciled snapshot.

Current repository содержит `AuditLogModule`, `AuditLog` model и admin audit-log API/UI. Старое утверждение об отсутствии dedicated audit log больше не current fact.

Владелец должен выбрать: `REQUIRED_FOR_MVP` / `POST_MVP` / `REMOVED_FROM_MVP`.

## 5. Storage / deployment

MVP требует S3-compatible storage capability, но конкретный live provider — `LIVE-VERIFY`.

Repository ориентирован на Railway-first + Docker portability. Current deploy configuration выполняет `prisma migrate deploy`; фактический deployment outcome и provider state требуют dated/live evidence.

Staging topology, backups/PITR, Redis, scanner, Sentry/alerts и domains не выводятся только из repository code.

## 6. Auth/security boundary

В MVP входят authenticated sessions/access tokens, refresh/session revocation, organization scoping, role-based authorization и необходимые runtime/CI security controls.

Current implementation содержит server-side sessions, refresh rotation, logout/logout-all и рабочий password-reset flow. Live delivery/provider readiness проверяется отдельно.

## 7. Certificates/reports

Certificates входят в MVP. Basic reports входят только в объёме core workflows; универсальная advanced BI/reporting platform не является MVP gate.

## 8. Completion gate

MVP scope согласован, когда:

- core `IN-MVP` capabilities имеют подтверждённый acceptance status;
- release-blocking owner decisions явно закрыты;
- live-dependent checks имеют fresh evidence или accepted waiver;
- current docs не противоречат canonical owner-sources.

Notifications и General Audit Log уже реализованы, но их MVP disposition всё ещё требует owner decision.

## Связанные документы

- `docs/README.md`
- `docs/PROJECT_SOURCE_OF_TRUTH.md`
- `docs/TODO_VERIFY.md`
