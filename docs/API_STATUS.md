# API Status

Last synced: 2026-05-27  
Source branch: `feature/integration-tests-skeleton`

## Current status

Integration tests skeleton is implemented in this branch:

- Added `apps/api/src/integration/app.integration.spec.ts`.
- Added test Nest application bootstrap with the same global API prefix as runtime: `/api/v1`.
- Registered the global `ApiExceptionFilter` in the integration test app.
- Added a smoke test for `GET /api/v1/health`.
- Added a smoke test for `GET /api/v1/openapi`.
- Added a negative integration test for centralized error format using a Zod validation failure.
- Used Node `http` test requests to avoid adding `supertest` or changing `pnpm-lock.yaml`.
- Added Jest module mappers for integration test imports.

## Current integration coverage

```text
GET /api/v1/health
GET /api/v1/openapi
GET /api/v1/integration-test/validation-error
```

## Current limitations

- No database integration tests yet.
- No test containers or seed data yet.
- No full auth flow integration test yet.
- No `supertest` dependency.
- No CI workflow change.
