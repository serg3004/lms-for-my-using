# API Status

Last synced: 2026-05-25  
Source branch: `main`

## Implemented

- Monorepo foundation: `apps/api`, `apps/web`, `packages/shared`, `infra`, `docs`.
- GitHub Actions CI: install, lint, Prisma generate, typecheck, tests, build.
- API config validation with Zod.
- Prisma foundation with initial `Organization`, `User`, and `Membership` models.
- Health API:
  - `GET /api/v1/health`
- Organizations API:
  - `GET /api/v1/organizations`
  - `GET /api/v1/organizations/:id`
  - `POST /api/v1/organizations`
  - Zod validation
  - Prisma-backed service
  - basic validation tests
  - read endpoints protected by JWT auth guard
- Users API:
  - `GET /api/v1/users`
  - `GET /api/v1/users/:id`
  - `POST /api/v1/users`
  - accepts plaintext `password` input
  - stores only `passwordHash`
  - supports optional `position` and `shift`
  - Zod validation
  - Prisma-backed service
  - basic validation tests
  - read endpoints protected by JWT auth guard
- Memberships / roles API:
  - `GET /api/v1/memberships`
  - `GET /api/v1/memberships/:id`
  - `POST /api/v1/memberships`
  - Zod validation
  - Prisma-backed service
  - basic validation tests
  - endpoints protected by JWT auth guard
- Auth foundation:
  - login input validation
  - current user response shape
  - active user lookup by organization and email
  - password verification flow
  - no password hash returned
  - basic validation tests
- JWT auth API:
  - `POST /api/v1/auth/login`
  - `GET /api/v1/auth/me`
  - HS256 JWT signing and verification with Node `crypto`
  - `JWT_SECRET` minimum length validation
  - reusable `AuthGuard`
  - basic token and guard tests
- Password hashing flow:
  - Node `crypto.scrypt` password hashing
  - password verification helper
  - wrong password rejection test

## Current backend modules

```text
auth
health
memberships
organizations
users
```

## Not implemented yet

```text
RBAC
organization scope guard
groups
courses
lessons
files
assignments
progress
assessments
certificates
notifications
reports
audit
```

## Current limitations

- `POST /api/v1/organizations` and `POST /api/v1/users` remain public until bootstrap/admin registration flow is defined.
- Auth guard only checks a valid JWT and active user; it does not enforce RBAC yet.
- Organization scope guard is not implemented yet.
- JWT auth uses an internal Node `crypto` helper until a dependency PR can safely add a maintained JWT library with lockfile update.
- API error format is not centralized yet.
- API docs/OpenAPI are not implemented yet.

## Recommended next PRs

1. RBAC roles from memberships.
2. Organization scope guard.
3. Groups API.
4. Courses API skeleton.
5. Optional dependency PR to replace internal JWT helper with a maintained JWT library.
