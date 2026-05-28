# API Status

Last synced: 2026-05-28  
Source branch: `feat/learner-lessons-list`

## Current status

Learner lessons list web flow is available for the current MVP baseline:

- `/learn/courses/:id/lessons` is implemented in `apps/web`.
- The frontend API client calls the existing `GET /api/v1/courses/:courseId/lessons` endpoint.
- The learner course detail page links to the course lessons list.
- Missing tokens and `401 Unauthorized` responses show a basic learner-facing auth message.
- `404 Not Found` responses show a basic not-found state.
- Empty lesson lists show a basic empty state.
- No backend runtime API behavior changed in this PR.

## Current limitations

- No lesson detail UI.
- No lesson materials UI.
- No progress UI.
- No enrollment UI.
- No refresh token flow.
- No logout flow.
- No global state manager.
- No Prisma schema or migration changes.
- No CI/CD changes.
- No new dependencies.

## Endpoint map

No production API endpoint changes in this PR. The web flow uses the existing `GET /api/v1/courses/:courseId/lessons` contract.
