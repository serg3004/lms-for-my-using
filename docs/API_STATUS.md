# API Status

Last synced: 2026-05-26  
Source branch: `feature/assessment-results-reports`

## Current status

Assessment results / reports are implemented in this branch:

- `GET /api/v1/assessments/:assessmentId/results` returns attempt result summaries for privileged organization roles.
- `GET /api/v1/assessments/:assessmentId/report` returns aggregate assessment report metrics.
- `GET /api/v1/attempts/:id/result` returns an attempt result with answer-level correctness summary.
- Learners can read only their own attempt result through the result endpoint.
- Admins, managers, and instructors can read learner attempt results in the same organization.
- Attempt creation still enforces `Assessment.availableAfterCourseCompletion`.

Assessment attempt Prisma sync from PR #45 remains active:

- `schema.prisma` contains `AssessmentAttemptStatus`.
- `schema.prisma` contains `AssessmentAttempt`.
- `schema.prisma` contains `AssessmentAttemptAnswer`.
- `AssessmentAttemptsService` uses Prisma Client for attempt reads/writes instead of raw SQL.

## Endpoint map

```text
GET  /api/v1/courses/:id/completion

GET  /api/v1/assessments/:assessmentId/attempts
GET  /api/v1/assessments/:assessmentId/results
GET  /api/v1/assessments/:assessmentId/report
GET  /api/v1/attempts/:id
GET  /api/v1/attempts/:id/result
POST /api/v1/assessments/:assessmentId/attempts
```

## Current limitations

- Certificates are not implemented yet.
- Users bulk import is not implemented yet.
- OpenAPI, centralized API errors, and integration tests are not implemented yet.
