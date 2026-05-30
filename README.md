# lms-for-my-using

Learning management system.

## Project status

Current stage: early MVP foundation.

Implemented backend foundation:
- Health API
- Organizations / users / memberships / groups APIs
- Auth login/current user/logout and password reset skeleton
- Hardened stateless JWT access token verification
- Current user lookup bound to JWT subject/user id
- AuthGuard, RolesGuard / RBAC, OrganizationScopeGuard
- Protected direct user and organization creation endpoints
- Courses, lessons, materials, assignments, progress, assessments, attempts, reports, certificates API skeletons
- Assessment attempts are allowed only for published assessments
- Centralized API error format
- Shared API error response type aligned with backend error envelope
- OpenAPI document skeleton
- Runtime API environment validation for `API_PORT` and `JWT_SECRET`
- MVP API smoke coverage
- MVP Definition of Done, Pilot Checklist, Local Runbook, Seed Data
- RBAC Matrix and API Contracts
- Web auth shell and learner-facing flows
- Admin dashboard shell at `/admin`
- Learner certificate list/detail web flow with `/learn/certificates` and `/learn/certificates/:id`

## Auth/session status

Current auth/session implementation:
- Access token is a stateless JWT signed with `HS256`.
- JWT verification validates token structure, protected header, claims shape, `iat`, and `exp`.
- Current user lookup validates token `sub` against `User.id` plus `organizationId`, `email`, `active` status, and `deletedAt: null`.
- Logout is stateless: `POST /api/v1/auth/logout` validates the bearer token before returning `{ accepted: true }`.
- Password reset endpoints currently return unavailable skeleton behavior.
- Refresh token/httpOnly cookie, rate limiting, token revocation/session store, and full password reset flow are deferred.

## Implemented backend API

```text
GET  /api/v1/health
GET  /api/v1/openapi

POST /api/v1/auth/login
POST /api/v1/auth/logout
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
POST /api/v1/assessments/:assessmentId/attempts

GET  /api/v1/certificates
GET  /api/v1/certificates/:id
POST /api/v1/certificates
```

`POST /api/v1/organizations/register` remains the public workspace registration flow. Direct `POST /api/v1/users` and `POST /api/v1/organizations` require auth/RBAC.

`POST /api/v1/auth/logout` validates the bearer token before returning a stateless logout acknowledgement. The web logout helper clears the stored access token in `finally`.

## Implemented web flows

```text
/login
/admin
/learn
/learn/courses
/learn/courses/:id
/learn/courses/:id/lessons
/learn/lessons/:id
/learn/lessons/:id/materials
/learn/progress
/learn/assignments
/learn/assignments/:id
/learn/assessments
/learn/assessments/:id
/learn/certificates
/learn/certificates/:id
```

## MVP docs

- `docs/MVP_DEFINITION_OF_DONE.md`
- `docs/PILOT_CHECKLIST.md`
- `docs/MVP_LOCAL_RUNBOOK.md`
- `docs/RBAC_MATRIX.md`
- `docs/API_CONTRACTS.md`
- `docs/PROJECT_LOG.md`
- `docs/TODO_VERIFY.md`

## Current Prisma baseline

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20260526123000_add_assessment_attempts/migration.sql
apps/api/prisma/migrations/20260527100000_add_certificates/migration.sql
```

No database migration has been applied to any real database yet.

## Planned next steps

1. Auth error consistency and disabled password reset coverage.
2. Auth/session docs cleanup if behavior changes again.
3. Admin user management UI.
