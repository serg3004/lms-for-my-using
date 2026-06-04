# Architecture and Module Boundaries

Document status: docs-only  
Scope: current MVP architecture boundaries for API, Web, shared frontend code, contracts, and future module growth

This document records the current LMS module boundaries and the rules for extending them. It does not move files, refactor modules, change imports, change runtime behavior, update Prisma schema, or change API contracts.

## Current high-level structure

| Area | Path | Responsibility |
|---|---|---|
| API app bootstrap | `apps/api/src/main.ts`, `apps/api/src/app.module.ts` | NestJS startup, app-level module wiring, global API concerns. |
| API common utilities | `apps/api/src/common` | Shared API-only guards, decorators, filters, schemas, policies, and helpers. |
| API config | `apps/api/src/config` | Environment/config loading and validation. |
| API database | `apps/api/src/database` | Prisma access and database module wiring. |
| API domain modules | `apps/api/src/modules/*` | Domain-specific controllers, services, schemas, and tests. |
| API Prisma schema | `apps/api/prisma/schema.prisma` | Database model source of truth. |
| Web app shell/pages | `apps/web/src/app` | Routes, page components, protected route behavior, and top-level app composition. |
| Web shared code | `apps/web/src/shared` | Reusable UI, API client helpers, form validation, display labels, theme, logout helpers. |
| Web typed API modules | `apps/web/src/shared/api` | Frontend API domain wrappers and frontend-side API response/request types. |
| Web i18n | `apps/web/src/i18n` | Translation resources and i18n setup. |
| Web styles | `apps/web/src/styles` | Global styles and styling primitives. |
| Docs | `docs` | Planning, contracts, policies, status, and operational documentation. |
| Infra | `infra` | Deployment support files such as Railway and nginx docs/config. |

## API module boundaries

API domain modules live under `apps/api/src/modules`.

Current modules include:

- `assessment-attempts`
- `assessment-questions`
- `assessments`
- `assignments`
- `auth`
- `certificates`
- `course-materials`
- `courses`
- `groups`
- `health`
- `lessons`
- `memberships`
- `openapi`
- `organizations`
- `progress`
- `users`

Each API domain module should own its own:

- controller routes;
- service logic;
- request validation schemas;
- module wiring;
- module-specific tests.

Cross-cutting concerns should stay outside domain modules:

| Concern | Preferred location |
|---|---|
| Prisma client/module | `apps/api/src/database` |
| Auth guards, role policies, shared decorators | `apps/api/src/common` or `apps/api/src/modules/auth` when auth-specific |
| Env/config | `apps/api/src/config` |
| API-wide response/error utilities | `apps/api/src/common` |
| OpenAPI static document serving | `apps/api/src/modules/openapi` |

### API dependency direction

Preferred direction:

```text
controller -> service -> Prisma/database
controller -> request schema validation
guard/decorator -> common/auth policy
```

Avoid:

- controllers directly implementing business/database logic;
- unrelated modules importing each other's private service internals;
- duplicate role checks split across unrelated files;
- raw SQL unless explicitly reviewed and safely parameterized;
- request validation without Zod/runtime validation for new API inputs.

### API module creation rule

Create a new API module only when the domain has a clear lifecycle or responsibility that does not fit an existing module.

Before creating a new API module, check:

1. whether an existing module already owns the entity or workflow;
2. whether the new module would duplicate routes or service logic;
3. whether Prisma schema changes are required;
4. whether API contracts/OpenAPI/docs need to change;
5. whether RBAC policies need tests.

New API modules should be added to `AppModule` explicitly.

## Prisma and database boundaries

Prisma schema is the database source of truth:

```text
apps/api/prisma/schema.prisma
```

Rules:

- Runtime database access should go through Prisma.
- Prisma schema and migrations require explicit migration scope and must not be hidden inside docs-only, UI-only, dependency-only, or refactor PRs.
- Migration/backup rules are documented in `docs/MIGRATION_BACKUP_POLICY.md`.
- Seed changes should stay in `apps/api/prisma/seed.mjs` and should be idempotent.
- Database model changes must be reviewed together with API services, validation, tests, and docs impacted by the model.

## Web module boundaries

The current Web app is page-oriented.

`apps/web/src/app` owns:

- route composition;
- protected routes;
- page-level loading/error/empty states;
- admin pages;
- learner pages;
- login/logout page-level behavior;
- page smoke/render tests.

`apps/web/src/shared` owns reusable frontend utilities and components:

- API client primitives;
- typed API modules under `shared/api`;
- shared UI primitives;
- admin page layout primitives;
- form validation helpers;
- error feedback helpers;
- display labels;
- theme helpers;
- logout helper.

`apps/web/src/i18n` owns translations and language setup.

`apps/web/src/styles` owns global styling.

### Web dependency direction

Preferred direction:

```text
app page -> shared/api domain wrapper
app page -> shared/ui/adminPage/formValidation helpers
shared/api domain wrapper -> shared/apiClient
shared/api types -> page/domain usage
```

Avoid:

- API request logic duplicated directly inside multiple pages;
- page-specific state or JSX moved into `shared` too early;
- `shared` importing from `app`;
- page files becoming the long-term home for reusable domain API contracts;
- adding new UI framework dependencies without a separate dependency/update review.

## Frontend API boundary

The frontend API boundary is split between:

- `apps/web/src/shared/apiClient.ts` — low-level request/error/CSRF behavior and backward-compatible exports;
- `apps/web/src/shared/api/*` — domain API wrappers and frontend API types.

Rules:

- New frontend API calls should prefer `apps/web/src/shared/api/<domain>.ts`.
- Shared response/request types should prefer `apps/web/src/shared/api/types.ts` or a domain-specific API file when the type is not broadly shared.
- Do not remove backward-compatible exports from `apiClient.ts` unless the PR is explicitly scoped as API client cleanup.
- API response shape changes must update backend controller/service, frontend API wrapper/types, tests, and API docs in the same logical PR.

## Shared code boundary

A helper belongs in `shared` only when it is used by more than one page or is clearly infrastructure-level.

Good candidates for `shared`:

- repeated UI primitives;
- form validation helpers;
- API error mapping;
- common display labels;
- typed API wrappers;
- route/protection helpers used by multiple pages.

Poor candidates for `shared`:

- one-off page layout decisions;
- page-specific form state;
- page-specific copy;
- temporary compatibility code without a cleanup plan;
- business workflow logic that should live in backend services.

## API contract and OpenAPI boundary

Runtime API source of truth remains backend controllers, schemas, and services under `apps/api/src`.

Docs and OpenAPI must follow runtime code.

Related docs:

- `docs/API_CONTRACTS.md`
- API OpenAPI module under `apps/api/src/modules/openapi`

Rules:

- Do not change a public endpoint path, method, request shape, or response shape silently.
- Any public API contract change must update frontend API wrappers and docs in the same PR or explicitly document why not.
- New API input must use runtime validation.
- Frontend guesses about backend response shape should be replaced with typed wrappers and tests.

## RBAC and permission boundary

Backend API RBAC is the source of truth.

Frontend route visibility and navigation checks are UX helpers, not security controls.

Rules:

- Backend authorization must be enforced in guards/policies/services.
- Frontend `/admin` visibility must not be treated as permission enforcement.
- Role policy changes require tests.
- Product permission and workflow matrix work should be tracked separately from runtime RBAC changes unless the PR explicitly includes both.

## Testing boundary

Use the narrowest meaningful tests for the changed layer.

| Change type | Expected tests |
|---|---|
| API service/controller behavior | API unit/integration tests for happy and negative paths |
| API validation | validation failure tests |
| RBAC change | allowed and forbidden role tests |
| Web page behavior | render/smoke tests and interaction tests when practical |
| Shared frontend helper | unit tests |
| API wrapper/type behavior | API wrapper tests |
| Docs-only policy | code checks not required unless docs linting is enforced |

Do not claim checks passed unless they were run locally or confirmed by CI/user status.

## Import and file placement rules

Use real existing paths only.

Preferred rules:

- Keep imports local and explicit.
- Use type-only imports where only types are needed.
- Keep API-only code out of Web.
- Keep Web-only code out of API.
- Keep Prisma types and database access inside API/backend boundaries.
- Keep docs as docs; do not use docs-only PRs to change runtime behavior.

## When to refactor

Refactor only when it is directly needed for the task or explicitly requested.

Acceptable refactor triggers:

- duplicated logic causes a concrete bug or test gap;
- a page or service cannot be safely extended without extraction;
- a compatibility facade has a dedicated cleanup PR;
- a module boundary is actively blocking implementation.

Avoid:

- moving files only for aesthetics;
- broad cleanup mixed with feature work;
- introducing a new architecture pattern without project-wide need;
- deleting compatibility exports without a dedicated cleanup plan.

## PR scope rules

A PR should usually change one layer at a time.

| PR type | Should include | Should not include |
|---|---|---|
| Docs-only architecture policy | docs file only | runtime code, imports, tests, dependency changes |
| API feature | controller/service/schema/tests/docs | frontend refactor unrelated to the endpoint |
| Web feature | page/shared frontend code/tests | backend contract change unless explicitly required |
| Prisma migration | schema/migration/service/tests/docs | unrelated UI cleanup |
| Dependency update | manifests/lockfile/check notes | feature work |

If a change crosses API + Web + Prisma, document it as an integrated contract change and keep the diff minimal.

## Non-goals

This document does not:

- create a new frontend architecture;
- move pages into feature folders;
- introduce a shared package;
- change API module wiring;
- change RBAC implementation;
- change OpenAPI generation strategy;
- change Prisma schema or migrations;
- remove `apiClient.ts` compatibility exports;
- introduce E2E tests.
