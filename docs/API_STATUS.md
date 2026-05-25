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
  - read endpoints restricted to `admin` by RBAC
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
  - read endpoints restricted to `admin` and `manager` by RBAC
- Memberships / roles API:
  - `GET /api/v1/memberships`
  - `GET /api/v1/memberships/:id`
  - `POST /api/v1/memberships`
  - Zod validation
  - Prisma-backed service
  - basic validation tests
  - endpoints protected by JWT auth guard
  - read endpoints restricted to `admin` and `manager` by RBAC
  - create endpoint restricted to `admin` by RBAC
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
  - reusable `RolesGuard`
  - shared role policy map for current API endpoints
  - basic token, auth guard, and RBAC guard tests
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

## Current RBAC policy map

```text
GET /api/v1/organizations      admin
GET /api/v1/organizations/:id  admin

GET /api/v1/users              admin, manager
GET /api/v1/users/:id          admin, manager

GET /api/v1/memberships        admin, manager
GET /api/v1/memberships/:id    admin, manager
POST /api/v1/memberships       admin
```

## Not implemented yet

```text
organization scope guard
groups
courses
lessons
files
assignments
progress
assessment
certificates
notifications
reports
audit
```

## Current limitations

- `POST /api/v1/organizations` and `POST /api/v1/users` remain public until bootstrap/admin registration flow is defined.
- RBAC currently covers only implemented backend endpoints.
- `instructor` and `learner` roles are defined but will be enforced on Courses, Assignments, Progress, Knowledge Base, Reports, and Certificates APIs when those modules exist.
- Organization scope guard is not implemented yet.
- JWT auth uses an internal Node `crypto` helper until a dependency PR can safely add a maintained JWT library with lockfile update.
- API error format is not centralized yet.
- API docs/OpenAPI are not implemented yet.

## Recommended next PRs

1. Organization scope guard.
2. Groups API.
3. Courses API skeleton.
4. Extend RBAC policies as new LMS modules are implemented.
5. Optional dependency PR to replace internal JWT helper with a maintained JWT library.
