# Auth token revocation and logout hardening (PR 121)

## Scope

PR 121 closes the token revocation and logout hardening work:

- current-session logout remains idempotent and revokes the active `Session` by `jti`;
- `POST /auth/logout-all` revokes all active sessions for the authenticated user inside the current organization;
- cookie-authenticated unsafe requests require a matching CSRF token;
- bearer-authenticated logout-all requests do not require CSRF;
- auth cookies are cleared for both logout variants;
- invalid or already-revoked tokens keep logout endpoints idempotent.

## Tenant isolation

`logout-all` updates only rows matching all of these conditions:

- `userId` equals the authenticated user;
- `organizationId` equals the authenticated organization;
- `revokedAt` is `null`.

Sessions belonging to another user or another organization are not changed.

## API contract

```text
POST /auth/logout
POST /auth/logout-all
```

Successful responses use the existing idempotent contract:

```json
{ "accepted": true }
```

## Security behavior

- Cookie source: CSRF cookie and header must match.
- Bearer source: no CSRF requirement.
- Revoked sessions are excluded by existing access-session and refresh-session checks.
- No Prisma schema or migration changes are required for PR 121.

## Verification

Required before merge:

```text
[Check] Lint
[Check] Types
[Check] Tests
[Check] Build
[Check] CI
```

## Rollback

Revert the PR. No database rollback is required because PR 121 does not change the schema or migrations.
