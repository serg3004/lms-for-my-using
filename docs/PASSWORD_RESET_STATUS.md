# Password Reset Status

## Purpose

This document records the current password reset status for the MVP baseline.

It is a status document only. It does not introduce password reset delivery, token storage, email delivery, secrets, environment variables, Prisma changes, or runtime behavior.

## Current status

Password reset is **skeleton only** in the current MVP baseline.

The API exposes password reset endpoints:

```text
POST /api/v1/auth/password-reset/request
POST /api/v1/auth/password-reset/confirm
```

Current behavior:

- Both endpoints exist in `AuthController`.
- Both endpoints validate request bodies through Zod schemas.
- `request` validates an email-based reset request body.
- `confirm` validates a token plus new password body.
- `AuthService.requestPasswordReset()` always throws `503 Service Unavailable`.
- `AuthService.confirmPasswordReset()` always throws `503 Service Unavailable`.
- No reset token is generated.
- No reset token is persisted.
- No reset email is sent.
- No user password is changed through the reset endpoints.
- No refresh/session invalidation happens as part of reset.
- There is test coverage for the unavailable skeleton behavior.

## MVP implication

Password reset delivery is **not required** for the current controlled technical pilot.

For the pilot, acceptable account recovery options are:

- operator/admin-managed test user reset outside the LMS reset flow;
- replacing disposable pilot users;
- documenting known test credentials in a secure, non-repository channel.

The pilot must not rely on self-service password reset.

## Security constraints

Until password reset is fully designed and implemented:

- Do not add real email provider credentials.
- Do not commit reset secrets, SMTP secrets, API keys, or tokens.
- Do not create reset tokens without expiry and one-time-use semantics.
- Do not reveal whether an email exists in password reset request responses.
- Do not log reset tokens or password values.
- Do not change passwords without verifying a valid reset token.
- Do not expose password hashes or token hashes through API responses.
- Do not bypass current auth, RBAC, or tenant isolation behavior.

## Future implementation checklist

Before enabling password reset, create a separate implementation plan covering:

1. Token model: hashed token storage, expiry, one-time use, and revocation.
2. User lookup policy: enumeration-safe request responses.
3. Delivery channel: email provider, local/dev adapter, retry behavior, and failure handling.
4. Password policy: minimum length, hashing, and validation errors.
5. Session behavior: whether active sessions/tokens remain valid or are revoked after reset.
6. Rate limiting: per-email and per-IP protection.
7. Audit logging: request, confirmation, failure, and abuse signals without token leakage.
8. Tenant isolation: organization-aware lookup and reset behavior.
9. Tests: request happy path, confirm happy path, invalid token, expired token, reused token, unknown email, weak password, and rate limit behavior.
10. Documentation: operator setup, incident response, rollback, and local development flow.

## Related docs

- `docs/MVP_READINESS_DASHBOARD.md`
- `docs/API_STATUS.md`
- `docs/API_CONTRACTS.md`
- `docs/MVP_DEFINITION_OF_DONE.md`
- `docs/PILOT_CHECKLIST.md`
