# API Status

Last synced: 2026-05-26  
Source branch: `feature/pr-45-sync-attempts-prisma`

## Current status

Assessment attempts technical debt from PR #44 is resolved in this branch:

- `schema.prisma` now contains `AssessmentAttemptStatus`.
- `schema.prisma` now contains `AssessmentAttempt`.
- `schema.prisma` now contains `AssessmentAttemptAnswer`.
- Assessment attempt relations are linked to `Organization`, `User`, `Assessment`, `AssessmentQuestion`, and `AssessmentAnswerOption`.
- `AssessmentAttemptsService` now uses Prisma Client for attempt reads/writes instead of raw SQL.

## Endpoint map

```text
GET  /api/v1/assessments/:assessmentId/attempts
GET  /api/v1/attempts/:id
POST /api/v1/assessments/:assessmentId/attempts
```

## Current limitations

- Course completion gate for final assessment is not implemented yet.
- Assessment results / reports are not implemented yet.
- Certificates are not implemented yet.
- Users bulk import is not implemented yet.
- OpenAPI, centralized API errors, and integration tests are not implemented yet.
