# API Status

Last synced: 2026-05-27  
Source branch: `feature/users-bulk-create`

## Current status

Users bulk create is implemented in this branch:

- `POST /api/v1/users/bulk` creates up to 50 users for one organization.
- Input is validated with Zod.
- Emails are trimmed, normalized to lowercase, and checked for duplicates inside the request payload.
- Existing organization users are checked before writes; duplicate database emails reject the whole request.
- User passwords are hashed before database writes.
- Bulk writes use Prisma Client and a transaction.
- The endpoint uses `AuthGuard`, `RolesGuard`, and `OrganizationScopeGuard`.

Assessment results / reports from PR #47 remain active:

- `GET /api/v1/assessments/:assessmentId/results`
- `GET /api/v1/assessments/:assessmentId/report`
- `GET /api/v1/attempts/:id/result`

Assessment attempt Prisma sync from PR #45 remains active:

- `schema.prisma` contains `AssessmentAttemptStatus`.
- `schema.prisma` contains `AssessmentAttempt`.
- `schema.prisma` contains `AssessmentAttemptAnswer`.
- `AssessmentAttemptsService` uses Prisma Client for attempt reads/writes instead of raw SQL.

## Endpoint map

```text
GET  /api/v1/courses/:id/completion

GET  /api/v1/users
GET  /api/v1/users/:id
POST /api/v1/users
POST /api/v1/users/bulk

GET  /api/v1/assessments/:assessmentId/attempts
GET  /api/v1/assessments/:assessmentId/results
GET  /api/v1/assessments/:assessmentId/report
GET  /api/v1/attempts/:id
GET  /api/v1/attempts/:id/result
POST /api/v1/assessments/:assessmentId/attempts
```

## Current limitations

- Users import is not implemented yet.
- Certificates are not implemented yet.
- OpenAPI, centralized API errors, and integration tests are not implemented yet.
