# Project Log

This file tracks completed project setup and implementation steps.

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

Added minimal NestJS API skeleton with health endpoint:

```text
GET /api/v1/health
```

### Frontend skeleton with i18n

Added minimal React/Vite frontend skeleton with locales:

```text
ru
en
kk
zh
```

### Shared package

Added initial shared package with locales, roles, pagination schema, and API types.

### Prisma / database foundation

Added initial Prisma foundation with models:

```text
Organization
User
Membership
```

Added initial Prisma migration:

```text
apps/api/prisma/migrations/20260524115000_init/migration.sql
```

No database migration was applied to any real database.

### GitHub Actions CI

Added CI workflow:

```text
.github/workflows/ci.yml
```

Current CI baseline:

```text
pnpm install --frozen-lockfile
pnpm --recursive lint
pnpm --filter @lms/api prisma:generate
pnpm --recursive typecheck
pnpm --recursive test
pnpm --recursive build
```

### Local Docker services

Added local Docker services:

```text
PostgreSQL 16 Alpine
MinIO
```

Ports:

```text
PostgreSQL: 5432
MinIO API: 9000
MinIO Console: 9001
```

Values match `.env.example`.

## 2026-05-25

### API environment validation

Added API environment validation:

```text
apps/api/src/config/env.ts
apps/api/src/main.ts
```

Current behavior:

```text
API_PORT is validated with Zod
default API_PORT is 3000
invalid API_PORT fails before NestJS bootstrap
```

### ESLint flat config

Added ESLint flat config:

```text
eslint.config.js
```

### Test scripts baseline

Updated package test scripts so they are safe for the current baseline without test files:

```text
apps/api/package.json
apps/web/package.json
```

Current test scripts:

```text
API: jest --passWithNoTests
Web: vitest run --passWithNoTests
```

### Users API

Implemented initial Users API:

```text
GET  /api/v1/users
GET  /api/v1/users/:id
POST /api/v1/users
```

Included Zod validation, Prisma-backed service, password input handling, and tests.

### Memberships / roles API

Implemented initial Memberships API:

```text
GET  /api/v1/memberships
GET  /api/v1/memberships/:id
POST /api/v1/memberships
```

Included Zod validation, Prisma-backed service, role assignment support, and tests.

### Auth foundation

Implemented Auth foundation:

```text
POST /api/v1/auth/login
GET  /api/v1/auth/me
```

Added login validation, current user response shape, active user lookup, and password hash exclusion from responses.

### Password hashing flow

Added password hashing and verification using Node `crypto.scrypt`.

Current behavior:

```text
POST /api/v1/users accepts plaintext password input
only passwordHash is stored
login validates password against passwordHash
passwordHash is never returned in API responses
```

### User position / shift

Added nullable user fields:

```text
position
shift
```

Updated Prisma schema, migration, API response shape, validation, and tests.

Migration:

```text
apps/api/prisma/migrations/20260525110000_add_user_position_shift/migration.sql
```

### JWT login / current user

Implemented JWT login and current user flow:

```text
POST /api/v1/auth/login
GET  /api/v1/auth/me
```

Current behavior:

```text
JWT_SECRET is required and must be at least 32 characters
token signing and verification use internal Node crypto HS256 helper
current user is resolved from access token
```

### AuthGuard

Added reusable `AuthGuard`.

Applied it to implemented protected read endpoints:

```text
GET /api/v1/organizations
GET /api/v1/organizations/:id
GET /api/v1/users
GET /api/v1/users/:id
GET /api/v1/memberships
GET /api/v1/memberships/:id
```

### RBAC foundation

Added reusable RBAC foundation:

```text
Roles decorator
RolesGuard
shared role policy map
Membership-backed role checks
```

Current role policies:

```text
organizations read: admin
users read: admin, manager
memberships read: admin, manager
memberships create: admin
```

### Organization scope guard

Added tenant isolation foundation:

```text
OrganizationScope decorator
OrganizationScopeGuard
currentUser.organizationId scope checks
```

Current behavior:

```text
organization, user, and membership reads are scoped to current user organization
POST /api/v1/memberships requires body.organizationId to match current user organization
```

### Documentation sync

Updated:

```text
README.md
docs/API_STATUS.md
.github/auto-changes.log
```

### Groups API

Implemented Groups API:

```text
GET  /api/v1/groups
GET  /api/v1/groups/:id
POST /api/v1/groups
```

Added Prisma model and migration:

```text
Group
GroupStatus
apps/api/prisma/migrations/20260525160000_add_groups/migration.sql
```

Current policies:

```text
groups read: admin, manager
groups create: admin, manager
```

Group reads are scoped to current user organization.
Group creation requires `body.organizationId` to match current user organization.

### Courses API skeleton

Implemented Courses API skeleton:

```text
GET  /api/v1/courses
GET  /api/v1/courses/:id
POST /api/v1/courses
```

Added Prisma model and migration:

```text
Course
CourseStatus
apps/api/prisma/migrations/20260525163000_add_courses/migration.sql
```

Current policies:

```text
courses read: admin, manager, instructor
courses create: admin, instructor
```

Course reads are scoped to current user organization.
Course creation requires `body.organizationId` to match current user organization.

Scope limitation:

```text
Courses API is a skeleton.
Lessons, materials, assignments, progress, assessments, and certificates are not implemented yet.
```

### Current CI result

Current automated CI status:

```text
[Check] Lint: OK
[Check] Prisma generate: OK
[Check] Types: OK
[Check] Tests: OK
[Check] Build: OK
```

### Current next step

Continue LMS module implementation:

```text
Lessons API skeleton
Course materials / files API skeleton
Assignments API skeleton
Extend RBAC policies as new LMS modules are implemented
OpenAPI
Centralized API error format
Integration tests
```

No database migration has been applied to any real database yet.
