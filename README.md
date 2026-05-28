# lms-for-my-using

Learning management system.

## Project status

Current stage: early MVP foundation.

Implemented backend modules:
- Health API
- Organizations API
- Organization registration / first admin flow
- Users API
- Users bulk create API
- Users import skeleton API
- Memberships / roles API
- Auth login/current user
- Auth password reset skeleton
- AuthGuard
- RolesGuard / RBAC
- OrganizationScopeGuard
- Groups API
- Courses API skeleton
- Lessons API skeleton
- Course materials / files API skeleton
- Assignments API skeleton
- Progress API skeleton
- Course completion check by lesson progress
- Assessments API skeleton
- Assessment questions / answer options API skeleton
- Assessment media support for questions/options
- Assessment attempts / automatic grading API skeleton
- Course completion gate for gated assessment attempts
- Assessment results and reports API skeleton
- Certificates API skeleton
- Centralized API error format
- OpenAPI document skeleton
- Integration tests skeleton
- Runtime API environment validation for `API_PORT` and `JWT_SECRET`
- Centralized JWT secret access through API env config
- JWT secret failure behavior test coverage
- Zod validation errors returned as `400 Bad Request`

## Implemented backend API

```text
GET  /api/v1/health
GET  /api/v1/openapi

POST /api/v1/auth/login
POST /api/v1/auth/password-reset/request
POST /api/v1/auth/password-reset/confirm
GET  /api/v1/auth/me

GET  /api/v1/organizations
GET  /api/v1/organizations/:id
POST /api/v1/organizations
POST /api/v1/organizations/register

GET  /api/v1/users
GET  /api/v1/users/:id
POST /api/v1/users
POST /api/v1/users/bulk
POST /api/v1/users/import

GET  /api/v1/memberships
GET  /api/v1/memberships/:id
POST /api/v1/memberships

GET  /api/v1/groups
GET  /api/v1/groups/:id
POST /api/v1/groups

GET  /api/v1/courses
GET  /api/v1/courses/:id
GET  /api/v1/courses/:id/completion
POST /api/v1/courses

GET  /api/v1/courses/:courseId/lessons
GET  /api/v1/lessons/:id
POST /api/v1/courses/:courseId/lessons

GET  /api/v1/courses/:courseId/materials
GET  /api/v1/materials/:id
POST /api/v1/courses/:courseId/materials

GET  /api/v1/assignments
GET  /api/v1/assignments/:id
POST /api/v1/assignments

GET  /api/v1/progress
GET  /api/v1/progress/:id
POST /api/v1/progress

GET  /api/v1/assessments
GET  /api/v1/assessments/:id
POST /api/v1/assessments

GET  /api/v1/assessments/:assessmentId/questions
GET  /api/v1/questions/:id
POST /api/v1/assessments/:assessmentId/questions

GET  /api/v1/questions/:questionId/options
POST /api/v1/questions/:questionId/options

GET  /api/v1/assessments/:assessmentId/attempts
GET  /api/v1/assessments/:assessmentId/results
GET  /api/v1/assessments/:assessmentId/report
GET  /api/v1/attempts/:id
GET  /api/v1/attempts/:id/result
POST /api/v1/assessments/:assessmentId/attempts

GET  /api/v1/certificates
GET  /api/v1/certificates/:id
POST /api/v1/certificates
```

## API environment validation

The API validates the runtime environment on startup:

```text
API_PORT=3000
JWT_SECRET=change-me-change-me-change-me-32chars
```

`JWT_SECRET` must be at least 32 characters and is accessed by auth through the centralized API env config. Tests cover missing and short JWT secret failure behavior for both env config and auth tokens.

## API error format

The API uses a centralized error response format. Zod validation errors, including `schema.parse(body)` failures in controllers, are normalized to `400 Bad Request` with `VALIDATION_ERROR`.

## Auth password reset skeleton

`POST /api/v1/auth/password-reset/request` accepts `organizationId` and `email`, normalizes email casing, and returns a generic `{ "accepted": true }` response to avoid account enumeration.

`POST /api/v1/auth/password-reset/confirm` accepts `token` and a strong password candidate. The current skeleton validates input and returns `{ "accepted": true }`.

Current constraints:
- no password reset token persistence;
- no email delivery;
- no password hash update;
- no rate limiting store;
- no Prisma schema or migration changes.

## OpenAPI document skeleton

`GET /api/v1/openapi` returns a static OpenAPI 3.0.3 JSON document.

## Integration tests skeleton

Integration test scaffold is available under:

```text
apps/api/src/integration/app.integration.spec.ts
```

Current coverage:
- `GET /api/v1/health` smoke test.
- `GET /api/v1/openapi` smoke test.
- Global centralized error format smoke test for Zod validation errors.
- `schema.parse(body)` validation errors return `400 Bad Request`.

## Current Prisma baseline

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20260526123000_add_assessment_attempts/migration.sql
apps/api/prisma/migrations/20260527100000_add_certificates/migration.sql
```

No database migration has been applied to any real database yet.

## Planned next steps

1. Continue through the MVP PR plan.
