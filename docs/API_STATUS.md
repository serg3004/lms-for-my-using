# API Status

Last synced: 2026-05-28  
Source branch: `feat/web-auth-shell`

## Current status

Web auth shell is available for the current MVP baseline:

- `/login` is implemented in `apps/web`.
- The frontend API client posts to `/api/v1/auth/login`.
- Access tokens are stored in browser local storage for follow-up API requests.
- Basic auth error messages are displayed on the login form.
- No backend runtime API behavior changed in this PR.

## Current limitations

- No refresh token flow.
- No logout flow.
- No global state manager.
- No Prisma schema or migration changes.
- No CI/CD changes.
- No new dependencies.

## Endpoint map

No production API endpoint changes in this PR. The web shell uses the existing `POST /api/v1/auth/login` contract.
