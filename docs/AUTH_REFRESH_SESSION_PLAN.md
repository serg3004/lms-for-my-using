# Refresh sessions and logout invalidation plan

## Status

Planning only. This document does not apply a Prisma schema change, does not create a migration, and does not change the current auth runtime.

## Current state confirmed from code

- `POST /auth/login` validates credentials, signs a one-hour access JWT, creates a CSRF token, and sets auth cookies.
- `POST /auth/logout` currently verifies the access token, validates CSRF for cookie-auth unsafe requests, clears auth cookies, and returns `{ accepted: true }`.
- `GET /auth/me` reads the access token from the bearer header or auth cookie.
- Access JWTs are stateless and signed with HS256.
- There is no persisted refresh session model in the current Prisma schema.

## Goal

Add server-side refresh session lifecycle in a later implementation PR:

- short-lived access token;
- long-lived refresh token stored as a hashed server-side session record;
- refresh token rotation on every refresh;
- server-side logout invalidation;
- CSRF-compatible cookie behavior;
- migration plan reviewed before applying schema changes.

## Proposed Prisma model dry-run

Add a new model in a future Prisma schema PR:

```prisma
model RefreshSession {
  id                 String    @id @default(uuid()) @db.Uuid
  organizationId     String    @map("organization_id") @db.Uuid
  userId             String    @map("user_id") @db.Uuid
  tokenHash          String    @unique @map("token_hash")
  replacedByTokenId  String?   @map("replaced_by_token_id") @db.Uuid
  userAgent          String?   @map("user_agent")
  ipAddress          String?   @map("ip_address")
  expiresAt          DateTime  @map("expires_at") @db.Timestamptz
  revokedAt          DateTime? @map("revoked_at") @db.Timestamptz
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt          DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([organizationId, userId])
  @@index([userId, revokedAt])
  @@index([expiresAt])
  @@map("refresh_sessions")
}
```

Expected companion schema changes:

```prisma
model Organization {
  refreshSessions RefreshSession[]
}

model User {
  refreshSessions RefreshSession[]
}
```

Migration review notes:

- Add the table only; do not rewrite existing auth tables.
- Keep `tokenHash` unique.
- Do not store raw refresh tokens.
- Add indexes for user/session lookup and cleanup jobs.
- Apply only after migration dry-run against a disposable local database.

## Token and cookie design

Recommended token lifetimes:

- access token: 10-15 minutes;
- refresh token: 7-30 days for MVP;
- refresh cookie max age must match refresh token expiry.

Cookies:

- access cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, path `/api/v1`;
- refresh cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, path `/api/v1/auth`;
- CSRF cookie: readable by the web app, `Secure`, `SameSite=Lax`, path `/api/v1`.

Refresh token format:

- generate at least 32 random bytes;
- send raw refresh token only in the `HttpOnly` refresh cookie;
- store only `sha256` or stronger keyed hash server-side;
- compare hashes with timing-safe comparison where applicable.

## Endpoint plan

### POST /auth/login

Future behavior:

1. Validate credentials.
2. Create access token.
3. Create refresh token.
4. Store refresh session with hashed refresh token.
5. Set access, refresh, and CSRF cookies.
6. Return current login response plus `csrfToken`.

### POST /auth/refresh

Future behavior:

1. Read refresh token from the refresh cookie only.
2. Require valid CSRF token for cookie-auth unsafe request.
3. Hash refresh token and find active session.
4. Reject if not found, expired, revoked, or user is inactive/deleted.
5. Rotate refresh token inside a transaction:
   - revoke old session;
   - create replacement session;
   - link `replacedByTokenId`.
6. Issue a new access token.
7. Set new access, refresh, and CSRF cookies.
8. Return minimal response, for example `{ accepted: true, csrfToken }`.

Replay handling:

- If a revoked refresh token is used again, revoke the entire session chain for that user/device if the chain can be identified.
- Return a generic unauthorized error; do not reveal whether the token was expired, revoked, or unknown.

### POST /auth/logout

Future behavior:

1. Read access token for user identity when available.
2. Read refresh token from cookie when available.
3. Require CSRF for cookie-auth unsafe request.
4. Revoke the matching refresh session server-side.
5. Clear access, refresh, and CSRF cookies.
6. Return `{ accepted: true }` even if no active refresh session is found.

### Logout all sessions

Later optional endpoint:

- `POST /auth/logout-all`
- Requires authenticated user and CSRF for cookie auth.
- Revokes all active refresh sessions for the current user in the current organization.

## CSRF behavior

Keep the current double-submit style for cookie-auth unsafe requests:

- safe methods do not require CSRF;
- bearer-auth requests do not require CSRF;
- cookie-auth unsafe requests require `x-csrf-token` matching the CSRF cookie;
- `POST /auth/refresh` and `POST /auth/logout` should require CSRF when refresh/access comes from cookies.

The frontend must send `x-csrf-token` for unsafe API calls once cookie-first auth becomes the primary flow.

## Service implementation plan

Suggested future files, subject to read-before-write in the implementation PR:

- `apps/api/src/modules/auth/auth.refresh-sessions.ts`
  - token generation;
  - token hashing;
  - refresh session create/rotate/revoke helpers.
- `apps/api/src/modules/auth/auth.cookies.ts`
  - add refresh cookie helpers.
- `apps/api/src/modules/auth/auth.service.ts`
  - login creates refresh session;
  - refresh rotates session;
  - logout revokes current session.
- `apps/api/src/modules/auth/auth.controller.ts`
  - add `POST /auth/refresh`;
  - pass request metadata needed for session records.

Do not introduce a new auth architecture layer unless implementation complexity proves it is needed.

## Tests required in implementation PR

Minimum backend tests:

- login creates access token, refresh cookie, CSRF token, and refresh session;
- refresh with a valid refresh cookie rotates the session and returns a new CSRF token;
- refresh with a revoked token fails;
- refresh with an expired token fails;
- logout revokes the current refresh session and clears cookies;
- cookie-auth refresh/logout without valid CSRF fails;
- bearer-auth behavior remains compatible for existing protected routes.

## Rollout order

1. Add Prisma model and migration in a dedicated PR with dry-run evidence.
2. Add refresh session service helpers and tests.
3. Update login to create refresh sessions.
4. Add `POST /auth/refresh`.
5. Update logout to revoke the current refresh session.
6. Update frontend to use cookie-first refresh flow.
7. Remove localStorage access-token fallback in a separate PR.

## Risks

- Auth and Prisma changes are security-sensitive.
- Incorrect rotation can either lock users out or leave stolen refresh tokens usable.
- Cookie path and CSRF behavior must be tested in browser-like flows.
- Migration must be reviewed before applying to any non-local database.

## Explicit non-goals for this PR

- No Prisma schema edit.
- No migration file.
- No runtime auth behavior change.
- No frontend auth flow change.
- No dependency change.
