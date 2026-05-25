# API Status

Last synced: 2026-05-25  
Source branch: `main`

## Implemented

- Monorepo foundation and GitHub Actions CI.
- Prisma foundation with `Organization`, `User`, `Membership`, and `Group` models.
- Health API: `GET /api/v1/health`
- Organizations API:
  - `GET /api/v1/organizations`
  - `GET /api/v1/organizations/:id`
  - `POST /api/v1/organizations`
- Users API:
  - `GET /api/v1/users`
  - `GET /api/v1/users/:id`
  - `POST /api/v1/users`
- Memberships / roles API:
  - `GET /api/v1/memberships`
  - `GET /api/v1/memberships/:id`
  - `POST /api/v1/memberships`
- Groups API:
  - `GET /api/v1/groups`
  - `GET /api/v1/groups/:id`
  - `POST /api/v1/groups`
- Auth API:
  - `POST /api/v1/auth/login`
  - `GET /api/v1/auth/me`
- Reusable guards:
  - `AuthGuard`
  - `RolesGuard`
  - `OrganizationScopeGuard`

## Current RBAC policy map

```text
GET  /api/v1/organizations       admin
GET  /api/v1/organizations/:id   admin

GET  /api/v1/users               admin, manager
GET  /api/v1/users/:id           admin, manager

GET  /api/v1/memberships         admin, manager
GET  /api/v1/memberships/:id     admin, manager
POST /api/v1/memberships         admin

GET  /api/v1/groups              admin, manager
GET  /api/v1/groups/:id          admin, manager
POST /api/v1/groups              admin, manager
```

## Current organization scope behavior

```text
organizations, users, memberships, and groups read endpoints:
- current user organization only

POST /api/v1/memberships:
- body.organizationId must match current user organization

POST /api/v1/groups:
- body.organizationId must match current user organization
```

## Current limitations

- `POST /api/v1/organizations` and `POST /api/v1/users` remain public until bootstrap/admin registration flow is defined.
- RBAC currently covers only implemented backend endpoints.
- `instructor` and `learner` roles are defined but will be enforced on LMS module APIs when those modules exist.
- JWT auth uses an internal Node `crypto` helper until a dependency PR can safely add a maintained JWT library.
- API error format is not centralized yet.
- OpenAPI is not implemented yet.
- Integration tests are not implemented yet.

## Recommended next PRs

1. Courses API skeleton.
2. Extend RBAC policies as new LMS modules are implemented.
3. OpenAPI.
4. Centralized API error format.
5. Integration tests.
