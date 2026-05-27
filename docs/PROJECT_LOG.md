# Project Log

## 2026-05-27

### Align API environment validation

Implemented PR 1 scope on `fix/align-api-env-validation`.

Changes:
- Aligned JWT environment naming to the single `JWT_SECRET` used by auth token signing.
- Extended API env validation to require `JWT_SECRET` and validate `API_PORT`.
- Updated `.env.example` to remove unused JWT access/refresh secret names.
- Added env validation tests for valid env, missing JWT secret, and invalid API port.
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
- Updated README, API status, project log, and audit log.

Deferred:
- Password reset token persistence.
- Email delivery.
- Password hash update.
- Rate limiting storage.
- Prisma schema/migration changes.
- Secrets/env changes.

Current PR check status:

```text
[Check] Lint: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```
