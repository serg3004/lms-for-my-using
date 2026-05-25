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
- Memberships / roles API:
  - `GET /api/v1/memberships`
  - `GET /api/v1/memberships/:id`
  - `POST /api/v1/memberships`
  - Zod validation
  - Prisma-backed service
  - basic validation tests
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
  - basic token and validation tests
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
guards / RBAC
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

- Organizations, Users, and Memberships endpoints are not protected by auth/RBAC yet.
- Organization scope guard is not implemented yet.
- JWT auth uses an internal Node `crypto` helper until a dependency PR can safely add a maintained JWT library with lockfile update.
- API error format is not centralized yet.
- API docs/OpenAPI are not implemented yet.

## Recommended next PRs

1. Backend guards: auth, role, organization scope.
2. Groups API.
3. Courses API skeleton.
4. Optional dependency PR to replace internal JWT helper with a maintained JWT library.
