# Project Source of Truth

> **Статус:** `CURRENT` / transitional index until DOC-12.
>
> **Назначение:** навигатор по precedence и устойчивым решениям. Этот файл **не** является ручным inventory текущих routes, modules, roles, infrastructure или GitHub settings.
>
> **Reconciled against `main`:** `cbeecd860717c2b8df9c821c1cd7bad323ad3b0e` (2026-08-26).

## 1. Precedence

Для current implementation facts используйте canonical owner-sources из `docs/README.md`:

- DB entities/enums → Prisma schema;
- допустимый role set → Prisma `Role` + shared role constants/types;
- permissions/RBAC → `apps/api/src/modules/auth/roles.ts` + guards/access decorators;
- HTTP API surface → runtime OpenAPI + controllers;
- Nest modules → `apps/api/src/app.module.ts`;
- live GitHub/deployment/environment state → fresh live read-back + dated evidence.

Если Markdown противоречит owner-source, implementation fact берётся из owner-source. Нормативное product/architecture decision при этом не меняется автоматически: сначала нужно отделить factual drift от изменения решения.

## 2. Устойчивые решения проекта

### Architecture

**Статус:** `DECISION`

- Modular monolith first.
- Backend: NestJS + TypeScript.
- Frontend: React + Vite + TypeScript.
- Database: PostgreSQL.
- ORM/migrations: Prisma.
- Package manager: pnpm workspaces.
- UI: custom UI/CSS architecture; Tailwind/shadcn не являются базовым стеком.
- Multi-tenant boundary: organization scope.

Конкретный текущий набор ролей не дублируется здесь: его owner указан в `docs/README.md`.

### API

**Статус:** `DECISION`

- Base path: `/api/v1`.
- Runtime validation используется в current API contracts.
- Canonical error semantics определяются current API response/exception layer и shared types.
- Runtime API surface определяется runtime OpenAPI + controllers; ручные route lists не являются authority.

### MVP non-goals

**Статус:** `DECISION`

Без отдельного изменения scope не входят в MVP:

- AI tutor / RAG / AI course builder;
- native mobile app;
- SCORM/xAPI/LTI runtime integration;
- SSO/SAML;
- billing;
- advanced BI/analytics platform;
- drag-and-drop course builder;
- custom role builder.

Подробный scope и unresolved scope decisions находятся в `docs/product/MVP_SCOPE_LOCK.md`.

## 3. Current implementation guidance

Этот раздел намеренно не содержит полного inventory.

На reconciled snapshot подтверждены, среди прочего:

- server-side auth sessions, refresh rotation and revocation;
- working password-reset request/confirm flow;
- `NotificationsModule` и `AuditLogModule`;
- Prisma `Notification` и `AuditLog` models;
- runtime OpenAPI JSON at `/api/v1/api-json`;
- `GET /api/v1/courses/summary`;
- deployment config, который запускает `prisma migrate deploy` перед API process.

Эти bullets — **snapshot evidence only**. Перед использованием конкретного implementation fact необходимо читать соответствующий owner-source, а не этот список.

## 4. Product scope ≠ implementation

Наличие реализации не означает автоматического решения «обязательно для MVP».

В частности, Notifications и General Audit Log уже присутствуют в current implementation, но их product/MVP disposition остаётся отдельным scope decision, пока владелец не закроет соответствующие пункты в `product/MVP_SCOPE_LOCK.md` / `TODO_VERIFY.md`.

ИИ-агент не должен удалять существующую capability или объявлять её обязательным MVP gate только из-за факта реализации.

## 5. Live state

Следующие утверждения всегда требуют fresh evidence:

- repository visibility/protection/rulesets/required checks;
- фактическая Railway topology/services/domains;
- Redis, storage provider/bucket/CORS, scanner, Sentry/alerts;
- backups/PITR/restore readiness;
- current deployment status и production smoke.

Старый Markdown snapshot не является доказательством текущего platform state.

## 6. Historical/reference material

Pre-implementation master context хранится в `docs/archive/pre-implementation-master-context/`; PR verification snapshots, project logs, old smoke/readiness reports и старые design docs также являются history/evidence, а не current authority. Архив используется только для history/rationale/evidence и не определяет current implementation state.

## 7. Связанные current документы

- `docs/README.md` — documentation map и ownership.
- `docs/product/MVP_SCOPE_LOCK.md` — product/MVP boundaries.
- `docs/TODO_VERIFY.md` — decision / implementation / live verification registry до его последующей миграции.
- `docs/contracts/API_CONTRACTS.md` — human API semantics; API surface authority остаётся runtime OpenAPI + controllers.

Этот файл будет superseded/archive на DOC-12 после распределения уникального decision content по целевой taxonomy.
