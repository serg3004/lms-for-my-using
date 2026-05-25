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
  - no password hash returned
  - basic validation tests

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
JWT/login endpoint
password hashing flow
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
- Auth foundation does not issue JWT tokens yet.
- Password hashing and password comparison are not implemented yet.
- API error format is not centralized yet.
- API docs/OpenAPI are not implemented yet.

## Recommended next PRs

1. Password hashing flow.
2. JWT login endpoint and current user endpoint.
3. Backend guards: auth, role, organization scope.
4. Groups API.
5. Courses API skeleton.
