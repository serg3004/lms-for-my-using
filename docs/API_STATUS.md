# API Status

Last synced: 2026-05-25  
Source branch: `main`

## Implemented

- Prisma foundation with `Organization`, `User`, `Membership`, `Group`, `Course`, `Lesson`, and `CourseMaterial` models.
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
- Lessons API skeleton:
  - `GET /api/v1/courses/:courseId/lessons`
  - `GET /api/v1/lessons/:id`
  - `POST /api/v1/courses/:courseId/lessons`
- Course materials / files API skeleton:
  - `GET /api/v1/courses/:courseId/materials`
  - `GET /api/v1/materials/:id`
  - `POST /api/v1/courses/:courseId/materials`
- Auth API:
  - `POST /api/v1/auth/login`
  - `GET /api/v1/auth/me`
- Reusable guards:
  - `AuthGuard`
  - `RolesGuard`
  - `OrganizationScopeGuard`

## Current RBAC policy map

```text
GET  /api/v1/organizations                  admin
GET  /api/v1/organizations/:id              admin

GET  /api/v1/users                          admin, manager
GET  /api/v1/users/:id                      admin, manager

GET  /api/v1/memberships                    admin, manager
GET  /api/v1/memberships/:id                admin, manager
POST /api/v1/memberships                    admin

GET  /api/v1/groups                         admin, manager
GET  /api/v1/groups/:id                     admin, manager
POST /api/v1/groups                         admin, manager

GET  /api/v1/courses                        admin, manager, instructor
GET  /api/v1/courses/:id                    admin, manager, instructor
POST /api/v1/courses                        admin, instructor

GET  /api/v1/courses/:courseId/lessons      admin, manager, instructor
GET  /api/v1/lessons/:id                    admin, manager, instructor
POST /api/v1/courses/:courseId/lessons      admin, instructor

GET  /api/v1/courses/:courseId/materials    admin, manager, instructor
GET  /api/v1/materials/:id                  admin, manager, instructor
POST /api/v1/courses/:courseId/materials    admin, instructor
```

## Current organization scope behavior

```text
Read endpoints:
- current user organization only

Create endpoints:
- body.organizationId must match current user organization
- route courseId must belong to current user organization
- optional material lessonId must belong to the same course and organization
```

## Current limitations

- `POST /api/v1/organizations` and `POST /api/v1/users` remain public until bootstrap/admin registration flow is defined.
- Courses, Lessons, and Course Materials APIs are skeletons.
- Assignments, progress, assessments, certificates, and rich lesson content blocks are not implemented yet.
- OpenAPI is not implemented yet.
- API error format is not centralized yet.
- Integration tests are not implemented yet.

## Recommended next PRs

1. Assignments API skeleton.
2. Progress API skeleton.
3. Extend RBAC policies as new LMS modules are implemented.
4. OpenAPI.
5. Centralized API error format.
6. Integration tests.
