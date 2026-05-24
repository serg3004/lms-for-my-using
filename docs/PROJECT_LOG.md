# Project Log

This file tracks completed project setup steps.

## 2026-05-24

### Documentation uploaded

Added project documentation to `docs/`:

```text
AI_AGENT_STARTER_PROMPT.md
I18N_GUIDE.md
MVP_SCOPE_LOCK.md
PROJECT_SOURCE_OF_TRUTH.md
TODO_VERIFY.md
master-context/
```

### Monorepo foundation

Added base monorepo structure:

```text
apps/api/
apps/web/
packages/shared/
infra/docker/
infra/railway/
scripts/
package.json
pnpm-workspace.yaml
turbo.json
.env.example
```

### Backend skeleton

Added minimal NestJS API skeleton:

```text
apps/api/package.json
apps/api/tsconfig.json
apps/api/nest-cli.json
apps/api/src/main.ts
apps/api/src/app.module.ts
apps/api/src/modules/health/
apps/api/src/common/
apps/api/src/config/
apps/api/test/
```

Health endpoint planned in current skeleton:

```text
GET /api/v1/health
```

### Frontend skeleton with i18n

Added minimal React/Vite frontend skeleton:

```text
apps/web/package.json
apps/web/tsconfig.json
apps/web/index.html
apps/web/vite.config.ts
apps/web/src/main.tsx
apps/web/src/app/App.tsx
apps/web/src/i18n/
```

Initial frontend locales:

```text
ru
en
kk
zh
```

### Shared package

Added initial shared package:

```text
packages/shared/package.json
packages/shared/tsconfig.json
packages/shared/src/index.ts
packages/shared/src/constants/locales.ts
packages/shared/src/constants/roles.ts
packages/shared/src/schemas/pagination.schema.ts
packages/shared/src/types/api.ts
```

Includes:

```text
locales: ru, en, kk, zh
roles: learner, instructor, manager, admin
Zod: paginationQuerySchema
types: ApiError, ApiErrorResponse, PaginatedResponse
```

### Prisma / database foundation

Added initial Prisma foundation:

```text
apps/api/prisma/schema.prisma
apps/api/src/database/database.module.ts
apps/api/src/database/prisma.service.ts
```

Initial models:

```text
Organization
User
Membership
```

Initial enums:

```text
UserStatus
OrganizationStatus
OrganizationPlan
UserRole
```

No database migration was created or applied in this step.

### GitHub Actions CI

Added initial GitHub Actions CI workflow:

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

Also fixed the shared package build script:

```text
packages/shared/package.json
```

Changed:

```text
tsc -p itsconfig.json
```

to:

```text
tsc -p tsconfig.json
```

CI result after this step:

```text
[Check] Prisma generate: OK
[Check] Types: OK
[Check] Build: OK
[Check] Lint: not run
[Check] Tests: not run
```

## Current next step

Add `pnpm-lock.yaml` in a separate PR, then switch CI install from `--no-frozen-lockfile` to `--frozen-lockfile`.
