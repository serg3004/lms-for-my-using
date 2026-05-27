# API Status

Last synced: 2026-05-27  
Source branch: `feature/auth-hardening-password-reset-skeleton`

## Current status

Auth password reset skeleton is implemented in this branch:

- Added `POST /api/v1/auth/password-reset/request`.
- Added `POST /api/v1/auth/password-reset/confirm`.
- Added Zod validation schemas for request and confirm payloads.
- Added strong password validation for reset confirmation candidates.
- Added generic `{ "accepted": true }` response to avoid account enumeration.
- Added service skeleton methods without token persistence or email delivery.
- Added tests for accepted request, accepted strong confirmation input, and weak password rejection.
- Added password reset paths to the static OpenAPI skeleton.

## Current limitations

- No password reset token persistence yet.
- No email delivery yet.
- No password hash update yet.
- No rate limiting store yet.
- No Prisma schema or migration changes.
- No secrets or env changes.

## Endpoint map

```text
POST /api/v1/auth/password-reset/request
POST /api/v1/auth/password-reset/confirm
```
