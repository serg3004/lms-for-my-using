# lms-for-my-using

Learning management system.

## Project status

Current stage: early MVP foundation.

Created so far:

- project documentation in `docs/`
- monorepo foundation
- backend skeleton in `apps/api`
- frontend skeleton with i18n in `apps/web`
- shared package in `packages/shared`
- Prisma / database foundation
- initial Prisma migration
- GitHub Actions CI
- committed `pnpm-lock.yaml`
- root `turbo` dev dependency
- local Docker services for PostgreSQL and MinIO
- ESLint flat config
- safe baseline test scripts
- CI lint, Prisma generate, typecheck, tests, and build checks
- Health API
- Organizations API
- Users API
- Memberships / roles API
- Auth foundation
- password hashing flow
- JWT login and current user API
- reusable `AuthGuard`
- reusable `RolesGuard`
- reusable `OrganizationScopeGuard`
- RBAC policy map for current backend endpoints
- organization-scoped reads for current backend endpoints

## Implemented backend API

```text
GET  /api/v1/health

GET  /api/v1/organizations
GET  /api/v1/organizations/:id
POST /api/v1/organizations

GET  /api/v1/users
GET  /api/v1/users/:id
POST /api/v1/users

GET  /api/v1/memberships
GET  /api/v1/memberships/:id
POST /api/v1/memberships

POST /api/v1/auth/login
GET  /api/v1/auth/me
```

## Current backend security status

```text
Auth:
- JWT login/current user is implemented.
- JWT uses an internal Node crypto HS256 helper.
- JWT_SECRET must be at least 32 characters.
- passwordHash is not returned from auth responses.

RBAC:
- roles are checked through Membership records.
- current role enum: learner, instructor, manager, admin.
- organizations read: admin
- users read: admin, manager
- memberships read: admin, manager
- memberships create: admin

Organization scope:
- organization, user, and membership reads are scoped to current user organization.
- POST /api/v1/memberships requires body.organizationId to match current user organization.
```

## Current backend limitations

```text
POST /api/v1/organizations and POST /api/v1/users remain public until bootstrap/admin registration flow is defined.

Instructor and learner roles are defined but will be enforced on Courses, Assignments, Progress, Knowledge Base, Reports, and Certificates APIs when those modules exist.

OpenAPI is not implemented yet.
Centralized API error format is not implemented yet.
Integration tests are not implemented yet.
The internal JWT helper can later be replaced by a maintained JWT library when dependency and lockfile updates are safe.
```

## Tech stack

- TypeScript
- Node.js / ESM
- pnpm workspaces
- Turbo
- NestJS for API
- React + Vite for web
- Prisma + PostgreSQL
- Zod for runtime validation
- i18next / react-i18next for frontend i18n
- MinIO for local S3-compatible storage

## Repository structure

```text
apps/
  api/        Backend API
  web/        Frontend web app

packages/
  shared/     Shared constants, types, and schemas

docs/         Project documentation
infra/        Infrastructure configs
scripts/      Utility scripts
```

## Documentation

Main documentation is stored in:

```text
docs/
```

Important files:

```text
docs/PROJECT_SOURCE_OF_TRUTH.md
docs/MVP_SCOPE_LOCK.md
docs/TODO_VERIFY.md
docs/I18N_GUIDE.md
docs/PROJECT_LOG.md
docs/API_STATUS.md
docs/master-context/
```

## Current i18n baseline

Default locale:

```text
ru
```

Supported locales:

```text
ru
en
kk
zh
```

Frontend UI text must use translation keys instead of hardcoded strings.

## Current CI baseline

GitHub Actions CI is configured in:

```text
.github/workflows/ci.yml
```

Current CI runs:

```text
pnpm install --frozen-lockfile
pnpm --recursive lint
pnpm --filter @lms/api prisma:generate
pnpm --recursive typecheck
pnpm --recursive test
pnpm --recursive build
```

`pnpm-lock.yaml` is committed.

## Current tooling baseline

ESLint flat config is configured in:

```text
eslint.config.js
```

Current package test scripts are safe for the current baseline even when no test files exist.

## Current Prisma baseline

Prisma schema is defined in:

```text
apps/api/prisma/schema.prisma
```

Initial migration is committed:

```text
apps/api/prisma/migrations/20260524115000_init/migration.sql
apps/api/prisma/migrations/migration_lock.toml
```

User position/shift migration is committed:

```text
apps/api/prisma/migrations/20260525110000_add_user_position_shift/migration.sql
```

No database migration has been applied to any real database yet.

## Local Docker services

Local development services are configured in:

```text
infra/docker/docker-compose.yml
```

Services:

```text
PostgreSQL: localhost:5432
MinIO API: localhost:9000
MinIO Console: localhost:9001
```

Values match `.env.example`.

## Planned next steps

1. Groups API.
2. Courses API skeleton.
3. Extend RBAC policies as new LMS modules are implemented.
4. OpenAPI.
5. Centralized API error format.
6. Integration tests.

## Checks

Current automated CI status:

```text
[Check] Lint: OK
[Check] Prisma generate: OK
[Check] Types: OK
[Check] Tests: OK
[Check] Build: OK
```
