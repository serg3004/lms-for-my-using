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

## Tech stack

- TypeScript
- Node.js / ESM
- pnpm workspaces
- Turbo
- NestJS for API
- React + Vite for web
- Prisma + PostgreSQL planned
- Zod for runtime validation
- i18next / react-i18next for frontend i18n

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

## Planned next steps

1. Prisma / database foundation.
2. Local Docker services for PostgreSQL and MinIO.
3. API module implementation.
4. Frontend routing and layout.
5. Auth foundation.
6. Testing and CI setup.

## Checks

Automated checks are not configured yet.

Current check status:

```text
[Check] Lint: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```
