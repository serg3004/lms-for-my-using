# API Status

Last synced: 2026-05-26  
Source branch: `feature/course-completion-gate`

## Current status

Course completion gate is implemented in this branch:

- `GET /api/v1/courses/:id/completion` returns current user completion for a course.
- Course completion is calculated from published lessons and completed lesson progress.
- `Assessment.availableAfterCourseCompletion` is enforced before creating an assessment attempt.
- Gated assessment attempts are rejected until all published course lessons are completed.
- AuthGuard and RolesGuard protect the course completion endpoint through the existing courses controller guard stack.
- Existing attempt Zod validation is reused for attempt input.

Assessment attempt Prisma sync from PR #45 remains active:

- `schema.prisma` contains `AssessmentAttemptStatus`.
- `schema.prisma` contains `AssessmentAttempt`.
- `schema.prisma` contains `AssessmentAttemptAnswer`.
- `AssessmentAttemptsService` uses Prisma Client for attempt reads/writes instead of raw SQL.

## Endpoint map

```text
GET  /api/v1/courses/:id/completion

GET  /api/v1/assessments/:assessmentId/attempts
GET  /api/v1/attempts/:id
POST /api/v1/assessments/:assessmentId/attempts
```

## Current limitations

- Assessment results / reports are not implemented yet.
- Certificates are not implemented yet.
- Users bulk import is not implemented yet.
- OpenAPI, centralized API errors, and integration tests are not implemented yet.
