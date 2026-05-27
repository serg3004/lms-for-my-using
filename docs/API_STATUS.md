# API Status

Last synced: 2026-05-27  
Source branch: `fix/align-api-env-validation`

## Current status

API runtime environment validation is aligned with the auth token configuration:

- `apps/api/src/config/env.ts` validates `API_PORT` and `JWT_SECRET`.
- `JWT_SECRET` is the single token signing secret used by `auth.tokens.ts`.
- `.env.example` now documents `JWT_SECRET` instead of unused JWT access/refresh secret names.
- Added env validation tests for a valid environment, missing JWT secret, and invalid API port.

## Current limitations

- No Prisma schema or migration changes.
- No CI/CD changes.
- No new dependencies.

## Endpoint map

No API endpoint changes in this PR.
