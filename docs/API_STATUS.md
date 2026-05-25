# API Status

Last synced: 2026-05-25  
Source branch: `main`

## Implemented

- Monorepo foundation and GitHub Actions CI.
- Prisma foundation with `Organization`, `User`, `Membership`, `Group`, and `Course` models.
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
- Courses API skeleton:
  - `GET /api/v1/courses`
  - `GET /api/v1/courses/:id`
  - `POST /api/v1/courses`
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

GET  /api/v1/courses             admin, manager, instructor
GET  /api/v1/courses/:id         admin, manager, instructor
POST /api/v1/courses             admin, instructor
```

## Current organization scope behavior

```text
organizations, users, memberships, groups, and courses read endpoints:
- current user organization only

POST /api/v1/memberships:
- body.organizationId must match current user organization

POST /api/v1/groups:
- body.organizationId must match current user organization

POST /api/v1/courses:
- body.organizationId must match current user organization
```

## Current limitations

- `POST /api/v1/organizations` and `POST /api/v1/users` remain public until bootstrap/admin registration flow is defined.
- Courses API is a skeleton: lessons, materials, assignments, progress, assessments, and certificates are not implemented yet.
- RBAC currently covers only implemented backend endpoints.
- `learner` role is defined but will be enforced on learner-facing LMS APIs when those modules exist.
- JWT auth uses an internal Node `crypto` helper until a dependency PR can safely add a maintained JWT library.
- API error format is not centralized yet.
- OpenAPI is not implemented yet.
- Integration tests are not implemented yet.

## Recommended next PRs

1. Lessons API skeleton.
2. Course materials / files API skeleton.
3. Assignments API skeleton.
4. Extend RBAC policies as new LMS modules are implemented.
5. OpenAPI.
6. Centralized API error format.
7. Integration tests.
