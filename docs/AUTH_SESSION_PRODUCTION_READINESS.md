# Auth/session production readiness

## Status

This document captures the current auth/session readiness state before staging smoke verification.

This is a documentation-only PR. It does not change runtime auth behavior, cookies, JWT handling, environment variables, dependencies, Prisma schema, or migrations.

## Current implementation observed from code

- `POST /auth/login` validates the login payload, authenticates the user, signs a one-hour access JWT, creates a CSRF token, sets auth cookies, and returns the current user payload.
- `POST /auth/logout` resolves the access token from bearer auth or cookies, validates CSRF for cookie-auth unsafe requests, verifies the current user, clears auth cookies, and returns an accepted logout response.
- `GET /auth/me` resolves the access token from bearer auth or cookies and returns the current user.
- Access JWTs are stateless, signed with HS256, and include `sub`, `organizationId`, `email`, `iat`, and `exp`.
- Cookie auth uses an access-token cookie and a CSRF-token cookie. Cookie-backed unsafe requests require a matching `x-csrf-token`.
- Password reset endpoints currently return a service-unavailable response.

## MVP readiness

The current implementation is acceptable for staging MVP smoke verification if:

- login works for demo learner and admin accounts;
- logout clears cookies and the user can no longer access protected cookie-auth routes;
- bearer-auth compatibility remains working for API clients and existing frontend paths;
- role guards protect admin-only routes;
- invalid or expired access tokens return unauthorized responses;
- production/staging runs with a strong `JWT_SECRET`;
- browser cookie behavior is checked on the actual Railway staging domain.

## Known production-readiness gaps

These gaps are intentionally not fixed in this PR:

- no server-side refresh session store;
- no refresh token rotation;
- no token revocation for already-issued stateless access JWTs;
- logout clears cookies but cannot invalidate an already-issued bearer access token before it expires;
- no "logout all sessions" endpoint;
- password reset is not a full production flow yet;
- rate limiting is not Redis-backed;
- auth event audit logging is not implemented;
- cookie behavior still needs staging verification with the real domain and HTTPS setup.

## Staging auth smoke checklist

Run this during staging verification:

1. Login as learner.
2. Open learner protected pages.
3. Call `/api/v1/auth/me`.
4. Logout.
5. Confirm protected learner pages/API calls fail after logout.
6. Login as admin.
7. Open admin protected pages.
8. Confirm learner-only/non-admin users cannot access admin-only pages.
9. Confirm invalid token returns unauthorized.
10. Confirm expired token returns unauthorized.
11. Confirm cookie-auth unsafe requests without valid CSRF fail.
12. Confirm cookie-auth unsafe requests with matching CSRF succeed where expected.
13. Confirm password reset unavailable state is understandable and does not crash the UI/API.
14. Confirm cookies are set with expected secure behavior on the staging HTTPS domain.

## Post-MVP hardening backlog

Recommended order after staging smoke:

1. Add refresh-session Prisma model and migration in a dedicated DB PR.
2. Add hashed refresh-token storage and token rotation.
3. Add `POST /auth/refresh`.
4. Update logout to revoke the current refresh session.
5. Add optional `POST /auth/logout-all`.
6. Add Redis-backed rate limiting for login and password reset attempts.
7. Add auth event audit logging.
8. Implement full password reset flow.
9. Review cookie settings after staging domain and deployment topology are final.

## Explicit non-goals for this PR

- No auth runtime code changes.
- No cookie or JWT behavior changes.
- No new env vars or secrets.
- No dependency changes.
- No Prisma schema changes.
- No migrations.
- No frontend auth flow changes.

## Rollback

Revert this document-only PR. Runtime behavior is unaffected.
