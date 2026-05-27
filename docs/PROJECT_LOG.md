# Project Log

## 2026-05-27

### Handle Zod validation errors as bad requests

Implemented PR 2 scope on `fix/handle-zod-validation-errors`.

Changes:
- Verified centralized `ApiExceptionFilter` already maps `ZodError` to `400 Bad Request`.
- Added integration coverage for `POST /api/v1/auth/login` invalid body thrown by `schema.parse(body)`.
- Kept centralized API error response shape with `VALIDATION_ERROR`.
- Updated README, API status, project log, and audit log.

Deferred:
- Prisma schema/migration changes.
- CI/CD changes.
- Dependency changes.

Current PR check status:

```text
[Check] Lint: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```

## 2026-05-27

### Harden JWT secret failure behavior

Implemented PR 3 scope on `test/harden-jwt-secret-failures`.

Changes:
- Added env test coverage for `getJwtSecret()` returning a valid secret.
- Added env test coverage for short `JWT_SECRET`.
- Added auth token test coverage for missing configured JWT secret during signing.
- Added auth token test coverage for short configured JWT secret during verification.
- Kept runtime API behavior unchanged.
- Updated API status, project log, and audit log.

Deferred:
- Prisma schema/migration changes.
- CI/CD changes.
- Dependency changes.

Current PR check status:

```text
[Check] Lint: OK
[Check] Types: OK
[Check] Tests: OK
[Check] Build: OK
```
