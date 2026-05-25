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
- Health API
- Organizations API
- Users API
- Memberships / roles API
- Groups API
- Courses API skeleton
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

GET  /api/v1/groups
GET  /api/v1/groups/:id
POST /api/v1/groups

GET  /api/v1/courses
GET  /api/v1/courses/:id
POST /api/v1/courses

POST /api/v1/auth/login
GET  /api/v1/auth/me
```

## Current backend security status

```text
Auth:
- JWT login/current user is implemented.
- JWT_SECRET must be at least 32 characters.
- passwordHash is not returned from auth responses.

RBAC:
- roles are checked through Membership records.
- current role enum: learner, instructor, manager, admin.
- organizations read: admin
- users read: admin, manager
- memberships read: admin, manager
- memberships create: admin
- groups read: admin, manager
- groups create: admin, manager
- courses read: admin, manager, instructor
- courses create: admin, instructor

Organization scope:
- organization, user, membership, group, and course reads are scoped to current user organization.
- POST /api/v1/memberships, POST /api/v1/groups, and POST /api/v1/courses require body.organizationId to match current user organization.
```

## Current backend limitations

```text
POST /api/v1/organizations and POST /api/v1/users remain public until bootstrap/admin registration flow is defined.

Courses API is a skeleton. Lessons, materials, assignments, progress, assessments, and certificates are not implemented yet.

Learner role is defined but will be enforced on learner-facing LMS APIs when those modules exist.

OpenAPI is not implemented yet.
Centralized API error format is not implemented yet.
Integration tests are not implemented yet.
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

```text
docs/
docs/API_STATUS.md
docs/master-context/
```

## Current CI baseline

```text
pnpm install --frozen-lockfile
pnpm --recursive lint
pnpm --filter @lms/api prisma:generate
pnpm --recursive typecheck
pnpm --recursive test
pnpm --recursive build
```

## Current Prisma baseline

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20260524115000_init/migration.sql
apps/api/prisma/migrations/20260525110000_add_user_position_shift/migration.sql
apps/api/prisma/migrations/20260525160000_add_groups/migration.sql
apps/api/prisma/migrations/20260525163000_add_courses/migration.sql
```

No database migration has been applied to any real database yet.

## Planned next steps

1. Lessons API skeleton.
2. Course materials / files API skeleton.
3. Assignments API skeleton.
4. Extend RBAC policies as new LMS modules are implemented.
5. OpenAPI.
6. Centralized API error format.
7. Integration tests.
