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
- GitHub Actions CI

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

## Current CI baseline

GitHub Actions CI is configured in:

```text
.github/workflows/ci.yml
```

Current CI runs:

```text
pnpm install --no-frozen-lockfile
pnpm --filter @lms/api prisma:generate
pnpm --recursive typecheck
pnpm --recursive build
```

`pnpm-lock.yaml` is not committed yet, so CI uses `--no-frozen-lockfile`.

## Planned next steps

1. Sync documentation with current repo state.
2. Add `pnpm-lock.yaml` and switch CI to `--frozen-lockfile`.
3. Check and fix root tool dependencies such as `turbo`.
4. Create initial Prisma migration.
5. Local Docker services for PostgreSQL and MinIO.
6. API module implementation.
7. Frontend routing and layout.
8. Auth foundation.

## Checks

Current automated CI status:

```text
[Check] Prisma generate: OK
[Check] Types: OK
[Check] Build: OK
[Check] Lint: not run
[Check] Tests: not run
```
