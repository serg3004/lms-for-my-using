# API Status

Last synced: 2026-05-29  
Source branch: `fix/assessment-attempt-eligibility-api-error-contract`

## Current status

Assessment attempt eligibility and shared API error typing are hardened for the current MVP baseline:

- `POST /api/v1/assessments/:assessmentId/attempts` now rejects attempts for `draft` and `archived` assessments.
- Assessment attempts remain allowed for `published` assessments when the existing user, course-completion, attempt-limit, question, and answer validation gates pass.
- Shared `ApiErrorResponse` now matches the backend error envelope with `statusCode`, `error`, `path`, and `timestamp`.
- Shared `ApiError.details` now reflects backend validation detail objects instead of `unknown`.

## Current limitations

- No Prisma schema or migration changes.
- No CI/CD changes.
- No new dependencies.
- No frontend redesign.

## Endpoint map

```text
POST /api/v1/assessments/:assessmentId/attempts  protected, published assessments only
```
