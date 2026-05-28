# API Status

Last synced: 2026-05-28  
Source branch: `feat/learner-lesson-detail`

## Current status

Learner lesson detail web flow is available for the current MVP baseline:

- `/learn/lessons/:id` is implemented in `apps/web`.
- The frontend API client calls the existing `GET /api/v1/lessons/:id` endpoint.
- The learner lessons list links each lesson title to its detail page.
- Missing tokens and `401 Unauthorized` responses show a basic learner-facing auth message.
- `404 Not Found` responses show a basic not-found state.
- No backend runtime API behavior changed in this PR.

## Current limitations

- No lesson materials UI.
- No progress UI.
- No lesson completion action.
- No enrollment UI.
- No refresh token flow.
- No logout flow.
- No global state manager.
- No Prisma schema or migration changes.
- No CI/CD changes.
- No new dependencies.

## Endpoint map

No production API endpoint changes in this PR. The web flow uses the existing `GET /api/v1/lessons/:id` contract.
