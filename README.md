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
- CI lint and test checks

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

1. API module implementation.
2. Frontend routing and layout.
3. Auth foundation.

## Checks

Current automated CI status:

```text
[Check] Lint: OK
[Check] Prisma generate: OK
[Check] Types: OK
[Check] Tests: OK
[Check] Build: OK
```
