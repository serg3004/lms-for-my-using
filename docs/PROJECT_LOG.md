# Project Log

## 2026-05-27

### Add MVP API smoke coverage

Implemented PR 3 scope on `test/mvp-api-smoke-coverage`.

Changes:
- Expanded API integration smoke coverage for health.
- Added auth login happy path smoke coverage.
- Kept auth login invalid body negative coverage.
- Added protected endpoint without bearer token smoke coverage.
- Added tenant scope mismatch negative smoke coverage.
- Kept env validation coverage in `apps/api/src/config/env.spec.ts`.
- Updated README, API status, project log, and audit log.

Deferred:
- Prisma schema/migration changes.
- CI/CD changes.
- Dependency changes.
- Production runtime endpoint changes.

Current PR check status:

```text
[Check] Lint: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```

## 2026-05-27

### Handle Zod validation errors as bad requests

Implemented PR 2 scope on `fix/handle-zod-validation-errors`.

Changes:
- Verified centralized `ApiExceptionFilter` already maps `ZodError` to `400 Bad Request`.
- Added integration coverage for `POST /api/v1/auth/login` invalid body thrown by `schema.parse(body)`.
- Kept centralized API error response shape with `VALIDATION_ERROR`.
- Updated README, API status, project log, and audit log.

Current PR check status:

```text
[Check] Lint: OK
[Check] Types: OK
[Check] Tests: OK
[Check] Build: OK
```
