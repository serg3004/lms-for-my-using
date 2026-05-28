# lms-for-my-using

Learning management system.

## Project status

Current stage: early MVP foundation.

Implemented backend foundation:
- Health API
- Organizations / users / memberships / groups APIs
- Auth login/current user and password reset skeleton
- AuthGuard, RolesGuard / RBAC, OrganizationScopeGuard
- Courses, lessons, materials, assignments, progress, assessments, attempts, reports, certificates API skeletons
- Centralized API error format
- OpenAPI document skeleton
- Runtime API environment validation for `API_PORT` and `JWT_SECRET`
- Centralized JWT secret access through API env config
- MVP API smoke coverage
- MVP Definition of Done, Pilot Checklist, Local Runbook, and Seed Data
- RBAC Matrix and API Contracts
- Web auth shell with `/login`, frontend API client shell, access token storage, and basic auth error display
- Learner-facing web flow with `/learn`, current user loading, and basic unauthorized/session-expired handling

## Implemented backend API

```text
GET  /api/v1/health
GET  /api/v1/openapi

POST /api/v1/auth/login
POST /api/v1/auth/password-reset/request
POST /api/v1/auth/password-reset/confirm
GET  /api/v1/auth/me

GET  /api/v1/organizations
POST /api/v1/organizations
POST /api/v1/organizations/register

GET  /api/v1/users
POST /api/v1/users
POST /api/v1/users/bulk
POST /api/v1/users/import

GET  /api/v1/memberships
POST /api/v1/memberships

GET  /api/v1/groups
POST /api/v1/groups

GET  /api/v1/courses
POST /api/v1/courses
GET  /api/v1/courses/:id/completion

GET  /api/v1/courses/:courseId/lessons
POST /api/v1/courses/:courseId/lessons

GET  /api/v1/assignments
POST /api/v1/assignments

GET  /api/v1/progress
POST /api/v1/progress

GET  /api/v1/assessments
POST /api/v1/assessments

GET  /api/v1/certificates
POST /api/v1/certificates
```

## MVP docs

- `docs/MVP_DEFINITION_OF_DONE.md`
- `docs/PILOT_CHECKLIST.md`
- `docs/MVP_LOCAL_RUNBOOK.md`
- `docs/RBAC_MATRIX.md`
- `docs/API_CONTRACTS.md`

## MVP seed data

Seed data is available in:

```text
apps/api/prisma/seed.mjs
```

It creates:
- 1 organization
- 1 admin
- 1 instructor
- 2 learners
- 1 group
- 1 course
- 2 lessons
- 1 assignment
- 1 progress record

Run it from the API app after Prisma Client is generated and the local database is available:

```bash
cd apps/api
pnpm prisma:generate
node prisma/seed.mjs
```

Seed users use local-only emails under `example.test` and the local password printed by the seed script. Do not use seed credentials outside local or disposable pilot environments.

## API environment validation

The API validates the runtime environment on startup:

```text
API_PORT=3000
JWT_SECRET=change-me-change-me-change-me-32chars
```

`JWT_SECRET` must be at least 32 characters and is accessed by auth through the centralized API env config.

## MVP local runbook

Local setup and run instructions are documented in:

```text
docs/MVP_LOCAL_RUNBOOK.md
```

The runbook covers `.env` setup, local PostgreSQL/MinIO, Prisma generate, safe migration guardrails, API start, web start, health check, and seed data.

## MVP API smoke coverage

Integration smoke coverage is available in:

```text
apps/api/src/integration/app.integration.spec.ts
```

Current coverage:
- `GET /api/v1/health` smoke test.
- `GET /api/v1/openapi` smoke test.
- Auth login happy path.
- Auth login validation negative path.
- Protected endpoint without bearer token returns `401 Unauthorized`.
- Tenant scope mismatch returns `403 Forbidden`.
- Global centralized error format smoke test for Zod validation errors.

Environment validation is covered in:

```text
apps/api/src/config/env.spec.ts
```

## Centralized API error format

The global API exception filter normalizes Zod validation errors as `400 Bad Request` responses with `VALIDATION_ERROR`.

## RBAC and API contracts

Current MVP RBAC and API contracts are documented in:

```text
docs/RBAC_MATRIX.md
docs/API_CONTRACTS.md
```

## Auth password reset skeleton

Current constraints:
- no password reset token persistence;
- no email delivery;
- no password hash update;
- no rate limiting store;
- no Prisma schema or migration changes.

## Current Prisma baseline

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20260526123000_add_assessment_attempts/migration.sql
apps/api/prisma/migrations/20260527100000_add_certificates/migration.sql
```

No database migration has been applied to any real database yet.

## Planned next steps

1. Learner course list web flow.
