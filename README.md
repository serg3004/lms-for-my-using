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

## Implemented backend API

```text
GET  /api/v1/health

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

POST /api/v1/auth/login
GET  /api/v1/auth/me
```

## Centralized API error format

All unhandled API exceptions are normalized by the global `ApiExceptionFilter`.

Response shape:

```json
{
  "statusCode": 400,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email",
        "code": "invalid_string"
      }
    ]
  },
  "path": "/api/v1/example",
  "timestamp": "2026-05-27T00:00:00.000Z"
}
```

Supported normalization:
- Zod errors -> `400 VALIDATION_ERROR` with row/field-level details.
- Nest HTTP exceptions -> HTTP status based error codes such as `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, and `CONFLICT`.
- Prisma-like request errors -> `DATABASE_ERROR`, with `P2002` mapped to `409 CONFLICT`.
- Unknown errors -> `500 INTERNAL_SERVER_ERROR` without leaking internal details.

## Certificates skeleton

`POST /api/v1/certificates` issues a certificate record for a user/course when at least one eligibility rule is satisfied:
- all published course lessons are completed by the user; or
- the user has a passed assessment attempt for an assessment in the course.

The endpoint uses Zod validation, `AuthGuard`, `RolesGuard`, and `OrganizationScopeGuard`, stores certificates in the `Certificate` Prisma model, and returns an existing certificate for the same organization/course/user instead of creating duplicates.

Deferred certificate features:
- PDF generation;
- certificate template editor;
- public certificate verification page;
- certificate numbering format;
- certificate revocation endpoint;
- certificate UI.

## Current Prisma baseline

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20260526123000_add_assessment_attempts/migration.sql
apps/api/prisma/migrations/20260527100000_add_certificates/migration.sql
```

No database migration has been applied to any real database yet.

## Planned next steps

1. OpenAPI / Swagger skeleton.
2. Integration tests.
3. Deployment readiness.
