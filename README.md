# lms-for-my-using

Learning management system.

## Project status

Current stage: early MVP foundation.

Implemented backend foundation:
- Health API
- Organizations / users / memberships / groups APIs
- Auth login/current user and password reset skeleton
- AuthGuard, RolesGuard / RBAC, OrganizationScopeGuard
- Protected direct user and organization creation endpoints
- Courses, lessons, materials, assignments, progress, assessments, attempts, reports, certificates API skeletons
- Centralized API error format
- OpenAPI document skeleton
- Runtime API environment validation for `API_PORT` and `JWT_SECRET`
- MVP API smoke coverage
- MVP Definition of Done, Pilot Checklist, Local Runbook, Seed Data
- RBAC Matrix and API Contracts
- Web auth shell and learner-facing flows
- Learner certificate list/detail web flow with `/learn/certificates` and `/learn/certificates/:id`

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
GET  /api/v1/courses/:id
GET  /api/v1/courses/:id/completion

GET  /api/v1/courses/:courseId/lessons
POST /api/v1/courses/:courseId/lessons
GET  /api/v1/lessons/:id

GET  /api/v1/courses/:courseId/materials
POST /api/v1/courses/:courseId/materials
GET  /api/v1/materials/:id

GET  /api/v1/assignments
GET  /api/v1/assignments/:id
POST /api/v1/assignments

GET  /api/v1/progress
POST /api/v1/progress

GET  /api/v1/assessments
GET  /api/v1/assessments/:id
POST /api/v1/assessments

GET  /api/v1/certificates
GET  /api/v1/certificates/:id
POST /api/v1/certificates
```

`POST /api/v1/organizations/register` remains the public workspace registration flow. Direct `POST /api/v1/users` and `POST /api/v1/organizations` require auth/RBAC.

## MVP docs

- `docs/MVP_DEFINITION_OF_DONE.md`
- `docs/PILOT_CHECKLIST.md`
- `docs/MVP_LOCAL_RUNBOOK.md`
- `docs/RBAC_MATRIX.md`
- `docs/API_CONTRACTS.md`

## Current Prisma baseline

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20260526123000_add_assessment_attempts/migration.sql
apps/api/prisma/migrations/20260527100000_add_certificates/migration.sql
```

No database migration has been applied to any real database yet.

## Planned next steps

1. Stabilization and bugfixes after learner MVP web shell.
