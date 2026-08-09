# Project Source of Truth

> **Статус:** `CURRENT`
>
> **Назначение:** канонический навигатор по решениям проекта и подтверждённым фактам реализации.
>
> **Проверено по `main`:** `83fdf34f5384e2d8e044590256d05149f4c39a6d` (2026-08-09).

## 1. Как читать этот документ

Каждое утверждение относится к одному из типов:

- `DECISION` — нормативное решение проекта. ИИ-агент `MUST` ему следовать, пока отдельная задача явно не меняет решение.
- `IMPLEMENTED` — факт, подтверждённый текущими code/config/schema/tests.
- `PARTIAL` — часть поведения реализована, часть остаётся открытой.
- `LIVE-VERIFY` — состояние внешней инфраструктуры. Его `MUST NOT` выводить только из репозитория.
- `HISTORICAL` — исторический материал. Он `MUST NOT` переопределять current implementation.
- `OWNER-DECISION` — требуется решение владельца продукта/репозитория. ИИ-агент `MUST NOT GUESS`.

### Приоритет источников

1. Для **implementation facts**: current code, Prisma schema/migrations, configuration и tests.
2. Для **product/scope decisions**: этот документ и `docs/MVP_SCOPE_LOCK.md`.
3. Для **нерешённых вопросов**: `docs/TODO_VERIFY.md`.
4. Для operational/runbook деталей: current deployment/security/storage docs, если они не помечены historical/stale.
5. `docs/master-context/`, historical reports, old PR verification files и project logs — только `HISTORICAL`/reference material.

Если документация противоречит current code/config, ИИ-агент обязан сначала установить, это implementation drift или намеренное изменение нормативного решения. Нельзя молча исправлять одно другим.

---

## 2. Нормативные решения проекта

### Архитектура

**Статус:** `DECISION`

- Modular monolith first.
- Backend: NestJS + TypeScript.
- Frontend: React + Vite + TypeScript.
- Database: PostgreSQL.
- ORM/migrations: Prisma.
- Package manager: pnpm workspaces.
- UI: custom UI/CSS architecture; Tailwind/shadcn не являются базовым стеком.
- Fixed application roles: `admin`, `manager`, `instructor`, `learner`.
- Multi-tenant boundary: `organizationId`/organization scope.

### API

**Статус:** `DECISION` + `IMPLEMENTED`

- Base path: `/api/v1`.
- Runtime validation: Zod schemas в текущих API areas.
- Pagination contract: `page=1`, `pageSize=20`, maximum `pageSize=200`.
- Canonical API error shape определён текущим API response/exception layer; не предполагать наличие `requestId`, если оно не подтверждено кодом.

### MVP non-goals

**Статус:** `DECISION`

Не входят в MVP без отдельного изменения scope:

- AI tutor / RAG / AI course builder;
- native mobile app;
- SCORM/xAPI/LTI runtime integration;
- SSO/SAML;
- billing;
- advanced BI/analytics platform;
- drag-and-drop course builder;
- custom role builder.

Подробный scope находится в `docs/MVP_SCOPE_LOCK.md`.

---

## 3. Подтверждённое текущее состояние реализации

### Monorepo/tooling

**Статус:** `IMPLEMENTED`

- Root package manager: `pnpm@9.15.0`.
- Root `dev`, `build`, `lint`, `typecheck`, `test` orchestration выполняется через Turbo.
- Workspace layout включает `apps/*` и `packages/*`.

**Правило для ИИ:** Turbo не считать optional orchestration, пока root scripts используют его как основной механизм.

### Backend

**Статус:** `IMPLEMENTED`

NestJS API содержит domain modules для auth, users, organizations, groups, courses, lessons, course materials, progress, assessments/attempts, assignments/submissions, certificates, manager flows, upload/storage, health, OpenAPI и других текущих областей.

`notifications` и универсальный domain-wide `audit` module в текущем module inventory отсутствуют.

### Frontend/i18n

**Статус:** `IMPLEMENTED` / `PARTIAL`

- React + Vite + TypeScript.
- Locale catalogs: `ru`, `en`, `kk`, `zh`.
- Русский остаётся fallback/current primary language в i18n configuration.
- Наличие locale catalogs не означает, что абсолютно все строки и date formatting полностью локализованы; связанные gaps описываются отдельной i18n документацией.

### Authentication/session

**Статус:** `IMPLEMENTED`

Current auth включает:

- access-token authentication;
- server-side `Session` records;
- refresh token hash/expiry;
- `POST /auth/refresh`;
- refresh rotation;
- logout и logout-all/session revocation;
- HttpOnly cookie-based auth components.

**Правило для ИИ:** old документы, где refresh token описан как future work, являются `HISTORICAL` и не переопределяют current auth code.

### Deployment configuration

**Статус:** `IMPLEMENTED` для repository config; `LIVE-VERIFY` для фактической инфраструктуры.

- Repository ориентирован на Railway-first deployment и Docker portability.
- API Railway start command выполняет `prisma migrate deploy` перед `node dist/main.js`.
- Canonical readiness probe: `/api/v1/health/ready`.
- Current repository guidance использует private API behind Web/nginx/private networking, а не historical direct-public API model.

### Storage/upload

**Статус:** `IMPLEMENTED` для contract; `LIVE-VERIFY` для provider.

Current implementation использует S3-compatible contract:

- private object storage;
- authorized/presigned downloads;
- buffered и multipart uploads;
- quarantine/malware-scan integration;
- cleanup tooling;
- storage readiness check.

`S3_FILE_ORIGIN` optional. Production example рекомендует provider-neutral S3-compatible setup (например R2/AWS S3); MinIO остаётся compatible/self-hosted option.

**Правило для ИИ:** `DO NOT ASSUME` конкретный production provider (MinIO/R2/AWS S3) без fresh deployment evidence.

---

## 4. Repository и CI facts

### Repository visibility

**Статус:** `IMPLEMENTED-FACT`

GitHub repository на момент проверки публичный.

Это operational fact, а не бессрочное product decision. Если visibility должна измениться, требуется отдельная owner/repository-setting задача.

### CI/security

**Статус:** `IMPLEMENTED` для workflows; `NOT-ENFORCED` для merge protection.

Current CI/CodeQL workflows выполняют lint/typecheck/tests/build и security checks. Однако `main` на момент проверки не защищён required status checks.

**Правило для ИИ:** green workflow ≠ machine-enforced merge gate, пока branch protection/ruleset это явно не подтверждает.

---

## 5. Внешнее состояние, которое нельзя выводить из GitHub code

Следующие утверждения всегда требуют fresh evidence и имеют статус `LIVE-VERIFY`:

- фактический Railway service/environment topology;
- наличие/отсутствие отдельного live staging environment;
- production S3-compatible provider, bucket и CORS;
- live Redis/scanner/Sentry/alert routing;
- backup/PITR configuration и restore readiness;
- current deployment domains;
- fresh production smoke result.

Repository config может описывать intended architecture, но не доказывает, что live infrastructure сейчас ей соответствует.

---

## 6. Открытые owner decisions

### Notifications

**Статус:** `OWNER-DECISION`

Некоторые planning/scope документы относили Notifications к MVP, но current API module inventory не содержит Notifications implementation.

Владелец должен выбрать одно:

- `REQUIRED_FOR_MVP`;
- `POST_MVP`;
- `REMOVED_FROM_MVP`.

ИИ-агент `MUST NOT` самостоятельно реализовывать Notifications или удалять их из MVP scope до решения владельца.

### General Audit Log

**Статус:** `OWNER-DECISION`

Есть отдельные domain-specific audit/security events, но универсальный append-only application Audit Log как самостоятельная MVP capability не подтверждён current module inventory.

Владелец должен определить, обязателен ли общий Audit Log для MVP.

### Environment model / staging

**Статус:** `OWNER-DECISION` для будущей topology; current documented state — без отдельного Railway staging.

`docs/MIGRATION_BACKUP_POLICY.md` фиксирует current repository policy: отдельного Railway staging environment нет. Создавать его или объявлять обязательным без отдельного решения нельзя.

---

## 7. Historical/reference material

**Статус:** `HISTORICAL`

Следующие категории документов не являются source of truth для current implementation без fresh verification:

- `docs/master-context/`;
- old PR verification snapshots;
- `PROJECT_LOG.md`;
- historical smoke reports;
- old readiness/backlog snapshots;
- PR-specific design docs, если current code ушёл дальше.

Их можно использовать для контекста, rationale и истории решений, но не для утверждения current behavior.

---

## 8. Правила для ИИ-агента

1. `MUST` проверять implementation facts по current code/config/tests.
2. `MUST` использовать `MVP_SCOPE_LOCK.md` для scope decisions.
3. `MUST` использовать `TODO_VERIFY.md` только для действительно открытых решений/verification.
4. `MUST NOT` превращать `LIVE-VERIFY` в факт без fresh evidence.
5. `MUST NOT` трактовать historical document как current runbook/source of truth.
6. `MUST NOT` выбирать вариант `OWNER-DECISION` самостоятельно.
7. При обнаружении drift `MUST` обновить соответствующий canonical документ в той же задаче, если изменение входит в scope.
8. Для быстро меняющихся status/assertions `SHOULD` указывать дату, SHA, workflow run/deployment evidence.

---

## 9. Связанные canonical документы

- `docs/MVP_SCOPE_LOCK.md` — что входит/не входит в MVP и где требуется owner decision.
- `docs/TODO_VERIFY.md` — decision/implementation/live verification registry.
- `docs/DOCUMENTATION_AUDIT.md` — evidence layer аудита документации; не является заменой current canonical docs.
- `README.md` — setup/navigation entry point, но не должен переопределять canonical decisions этого документа.
