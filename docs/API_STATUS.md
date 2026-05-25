# API Status

Last synced: 2026-05-25  
Source branch: `main`  
Current main commit: `fa9c98f1eb0b0c8fd565f62aa8cbb8f503c4ee9d`

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

## Current backend modules

```text
health
organizations
```

## Not implemented yet

```text
auth
users
roles / memberships
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

- Organizations endpoints are not protected by auth/RBAC yet.
- Organization scope guard is not implemented yet.
- Users and memberships APIs are still pending.
- API error format is not centralized yet.
- API docs/OpenAPI are not implemented yet.

## Recommended next PRs

1. Users API.
2. Memberships / roles API.
3. Auth foundation.
4. Backend guards: auth, role, organization scope.
5. Groups API.
6. Courses API skeleton.
