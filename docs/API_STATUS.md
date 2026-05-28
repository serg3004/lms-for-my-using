# API Status

Last synced: 2026-05-28  
Source branch: `feat/learner-course-list`

## Current status

Learner course list web flow is available for the current MVP baseline:

- `/learn/courses` is implemented in `apps/web`.
- The frontend API client calls the existing `GET /api/v1/courses` endpoint.
- Missing tokens and `401 Unauthorized` responses show a basic learner-facing auth message.
- `401 Unauthorized` clears the stored access token through the existing web API client behavior.
- Empty course lists show a basic empty state.
- No backend runtime API behavior changed in this PR.

## Current limitations

- No course detail UI.
- No enrollment/progress UI in the course list.
- No filters/search/sort controls.
- No refresh token flow.
- No logout flow.
- No global state manager.
- No Prisma schema or migration changes.
- No CI/CD changes.
- No new dependencies.

## Endpoint map

No production API endpoint changes in this PR. The web flow uses the existing `GET /api/v1/courses` contract.
