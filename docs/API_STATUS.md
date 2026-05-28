# API Status

Last synced: 2026-05-28  
Source branch: `feat/learner-web-flows`

## Current status

Learner-facing web flow is available for the current MVP baseline:

- `/learn` is implemented in `apps/web`.
- The frontend API client calls the existing `GET /api/v1/auth/me` endpoint.
- Successful login redirects to `/learn`.
- Missing tokens and `401 Unauthorized` responses show a basic learner-facing auth message.
- `401 Unauthorized` clears the stored access token.
- No backend runtime API behavior changed in this PR.

## Current limitations

- No refresh token flow.
- No logout flow.
- No global state manager.
- No course list UI yet.
- No Prisma schema or migration changes.
- No CI/CD changes.
- No new dependencies.

## Endpoint map

No production API endpoint changes in this PR. The web flow uses the existing `GET /api/v1/auth/me` contract.
