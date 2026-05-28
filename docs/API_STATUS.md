# API Status

Last synced: 2026-05-28  
Source branch: `feature/learner-assignments`

## Current status

Learner assignment list/detail web flow is available for the current MVP baseline:

- `/learn/assignments` is implemented in `apps/web`.
- `/learn/assignments/:id` is implemented in `apps/web`.
- The learner home page links to the assignments page.
- The frontend API client calls the existing `GET /api/v1/assignments` endpoint.
- The frontend API client calls the existing `GET /api/v1/assignments/:id` endpoint.
- Missing tokens and `401 Unauthorized` responses show a basic learner-facing auth message.
- `404 Not Found` assignment detail responses show a basic not-found state.
- Empty assignment lists show a basic empty state.
- No backend runtime API behavior changed in this PR.

## Current limitations

- No assignment submission UI.
- No assignment upload UI.
- No grading/review UI.
- No assignment filters/search/sort.
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
GET /api/v1/assignments
GET /api/v1/assignments/:id
```
