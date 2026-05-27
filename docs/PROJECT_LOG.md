# Project Log

## 2026-05-27

### Integration tests skeleton

Implemented PR #54 scope on `feature/integration-tests-skeleton`.

Changes:
- Added `apps/api/src/integration/app.integration.spec.ts`.
- Added test Nest application bootstrap with `/api/v1` global prefix.
- Registered `ApiExceptionFilter` in the integration test app.
- Added `GET /api/v1/health` smoke integration test.
- Added `GET /api/v1/openapi` smoke integration test.
- Added centralized error response integration test through a Zod validation failure.
- Used Node `http` requests instead of adding `supertest`.
- Added Jest module mappers for integration test imports.
- Updated README, API status, project log, and audit log.

Decision:
- Did not add `supertest` because that would require dependency and lockfile changes.
- Did not use the full `AppModule` to avoid database connection requirements in this skeleton PR.

Deferred:
- Database-backed integration tests.
- Auth flow integration tests.
- Test containers.
- Seed data.
- CI workflow changes.

Current PR check status:

```text
[Check] Lint: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```
