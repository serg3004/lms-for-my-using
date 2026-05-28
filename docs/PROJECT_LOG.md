# Project Log

## 2026-05-28

### Handle Zod validation errors as bad requests

Implemented PR 2 scope on `fix/handle-zod-validation-errors-pr2`.

Changes:
- Verified centralized API exception filter already maps `ZodError` to `400 Bad Request`.
- Added integration coverage for `schema.parse(body)` request body validation errors.
- Added POST JSON test helper in the integration scaffold.
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

Current PR check status:

```text
[Check] Lint: OK
[Check] Types: OK
[Check] Tests: OK
[Check] Build: OK
```

### Centralize JWT secret env access

Implemented PR 2 hardening scope on `refactor/centralize-jwt-secret-env`.

Changes:
- Added `getJwtSecret()` to API env config.
- Updated auth token signing/verification to use centralized JWT secret access.
- Removed direct `process.env.JWT_SECRET` access from `auth.tokens.ts`.
- Added auth token coverage for configured JWT secret usage.

Current PR check status:

```text
[Check] Lint: OK
[Check] Types: OK
[Check] Tests: OK
[Check] Build: OK
```

### Align API environment validation

Implemented PR 1 scope on `fix/align-api-env-validation`.

Changes:
- Aligned JWT environment naming to the single `JWT_SECRET` used by auth token signing.
- Extended API env validation to require `JWT_SECRET` and validate `API_PORT`.
- Updated `.env.example` to remove unused JWT access/refresh secret names.
- Added env validation tests for valid env, missing JWT secret, and invalid API port.

Current PR check status:

```text
[Check] Lint: OK
[Check] Types: OK
[Check] Tests: OK
[Check] Build: OK
```

### Auth hardening / password reset skeleton

Implemented PR #56 scope on `feature/auth-hardening-password-reset-skeleton`.

Changes:
- Added password reset request and confirm validation schemas.
- Added strong password policy for reset confirmation payloads.
- Added `POST /api/v1/auth/password-reset/request`.
- Added `POST /api/v1/auth/password-reset/confirm`.
- Added generic accepted responses to avoid account enumeration.
- Added password reset skeleton service methods.
- Added tests for request acceptance, strong confirmation acceptance, and weak password rejection.
- Added password reset paths to the static OpenAPI skeleton.

Current PR check status:

```text
[Check] Lint: OK
[Check] Types: OK
[Check] Tests: OK
[Check] Build: OK
```
