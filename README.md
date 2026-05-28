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
- Learner course list web flow with `/learn/courses`, course loading, empty state, and basic error handling
- Learner course detail web flow with `/learn/courses/:id`, course detail loading, not found state, and basic error handling
- Learner lessons list web flow with `/learn/courses/:id/lessons`, lessons loading, empty state, and basic error handling
- Learner lesson detail web flow with `/learn/lessons/:id`, lesson detail loading, not found state, and basic error handling

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

## Current Prisma baseline

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20260526123000_add_assessment_attempts/migration.sql
apps/api/prisma/migrations/20260527100000_add_certificates/migration.sql
```

No database migration has been applied to any real database yet.

## Planned next steps

1. Learner lesson materials web flow.
