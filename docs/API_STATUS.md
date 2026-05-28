# API Status

Last synced: 2026-05-28  
Source branch: `feature/learner-assessments`

## Current status

Learner assessment list/detail web flow is available for the current MVP baseline:

- `/learn/assessments` is implemented in `apps/web`.
- `/learn/assessments/:id` is implemented in `apps/web`.
- The learner home page links to the assessments page.
- The frontend API client calls the existing `GET /api/v1/assessments` endpoint.
- The frontend API client calls the existing `GET /api/v1/assessments/:id` endpoint.
- Missing tokens and `401 Unauthorized` responses show a basic learner-facing auth message.
- `404 Not Found` assessment detail responses show a basic not-found state.
- Empty assessment lists show a basic empty state.
- No backend runtime API behavior changed in this PR.

## Current limitations

- No assessment taking/attempt UI.
- No assessment submission UI.
- No grading/review UI.
- No assessment filters/search/sort.
- No enrollment UI.
- No refresh token flow.
- No logout flow.
- No global state manager.
- No Prisma schema or migration changes.
- No CI/CD changes.
- No new dependencies.

## Endpoint map

No production API endpoint changes in this PR. The web flow uses existing contracts:

```text
GET /api/v1/assessments
GET /api/v1/assessments/:id
```
