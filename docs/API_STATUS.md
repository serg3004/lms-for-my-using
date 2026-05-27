# API Status

Last synced: 2026-05-27  
Source branch: `refactor/centralize-jwt-secret-env`

## Current status

JWT secret access is centralized through the API environment config:

- `apps/api/src/config/env.ts` validates `API_PORT` and `JWT_SECRET`.
- `getJwtSecret()` returns the validated `JWT_SECRET`.
- `apps/api/src/modules/auth/auth.tokens.ts` no longer reads `process.env.JWT_SECRET` directly.
- Auth token tests cover explicit secret usage and configured JWT secret usage.

## Current limitations

- No Prisma schema or migration changes.
- No CI/CD changes.
- No new dependencies.
- No API endpoint changes.

## Endpoint map

No API endpoint changes in this PR.
