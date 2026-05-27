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
- OpenAPI document skeleton

## Implemented backend API

```text
GET  /api/v1/health

GET  /api/v1/openapi

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

## OpenAPI document skeleton

`GET /api/v1/openapi` returns a static OpenAPI 3.0.3 JSON document.

Current scope:
- API title, description, version, and `/api/v1` server.
- Bearer JWT security scheme.
- Common centralized API error response schema from PR #52.
- Initial path coverage for health, auth, organization registration, users, and certificates.
- Unit tests for document shape, error schema, and key paths.

Deferred:
- Swagger UI.
- `@nestjs/swagger` integration.
- Full DTO/request/response schemas for every endpoint.
- Generated OpenAPI client.
- Published `openapi.json` artifact.

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

## Current Prisma baseline

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20260526123000_add_assessment_attempts/migration.sql
apps/api/prisma/migrations/20260527100000_add_certificates/migration.sql
```

No database migration has been applied to any real database yet.

## Planned next steps

1. Integration tests.
2. Deployment readiness.
