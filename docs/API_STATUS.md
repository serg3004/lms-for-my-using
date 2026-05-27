# API Status

Last synced: 2026-05-27  
Source branch: `test/mvp-api-smoke-coverage`

## Current status

MVP API smoke coverage is expanded:

- `GET /api/v1/health` smoke coverage.
- Auth login happy path coverage through a local integration test controller.
- Auth login validation negative coverage through `schema.parse(body)`.
- Protected endpoint without bearer token returns `401 Unauthorized`.
- Tenant scope mismatch returns `403 Forbidden`.
- Environment validation remains covered in `apps/api/src/config/env.spec.ts`.

## Current limitations

- Smoke auth/tenant endpoints are integration-test-only controllers.
- No Prisma schema or migration changes.
- No CI/CD changes.
- No new dependencies.
- No public runtime API endpoint changes.

## Endpoint map

No production API endpoint changes in this PR.
