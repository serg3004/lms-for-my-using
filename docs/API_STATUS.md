# API Status

Last synced: 2026-05-26  
Source branch: `feature/pr-40-progress-api`

## Implemented

- Prisma models: `Organization`, `User`, `Membership`, `Group`, `Course`, `Lesson`, `CourseMaterial`, `Assignment`, `Progress`.
- Auth API: `POST /api/v1/auth/login`, `GET /api/v1/auth/me`.
- Reusable guards: `AuthGuard`, `RolesGuard`, `OrganizationScopeGuard`.

## Endpoint map

```text
GET  /api/v1/health

GET  /api/v1/organizations
GET  /api/v1/organizations/:id
POST /api/v1/organizations

GET  /api/v1/users
GET  /api/v1/users/:id
POST /api/v1/users

GET  /api/v1/memberships
GET  /api/v1/memberships/:id
POST /api/v1/memberships

GET  /api/v1/groups
GET  /api/v1/groups/:id
POST /api/v1/groups

GET  /api/v1/courses
GET  /api/v1/courses/:id
POST /api/v1/courses

GET  /api/v1/courses/:courseId/lessons
GET  /api/v1/lessons/:id
POST /api/v1/courses/:courseId/lessons

GET  /api/v1/courses/:courseId/materials
GET  /api/v1/materials/:id
POST /api/v1/courses/:courseId/materials

GET  /api/v1/assignments
GET  /api/v1/assignments/:id
POST /api/v1/assignments

GET  /api/v1/progress
GET  /api/v1/progress/:id
POST /api/v1/progress
```

## RBAC

```text
organizations read: admin
users read: admin, manager
memberships read: admin, manager
memberships create: admin
groups read/create: admin, manager
courses read: admin, manager, instructor
courses create: admin, instructor
lessons read: admin, manager, instructor
lessons create: admin, instructor
course materials read: admin, manager, instructor
course materials create: admin, instructor
assignments read/create: admin, manager, instructor
progress read/create: admin, manager, instructor
```

## Organization scope

```text
Read endpoints return current user organization data only.
Create endpoints with organizationId require organization match.
Progress create validates courseId, userId, optional lessonId, and score range.
```

## Current limitations

- Public organization/user create remains until bootstrap/admin flow.
- Courses, Lessons, Course Materials, Assignments, and Progress APIs are skeletons.
- Assessments, certificates, OpenAPI, centralized API errors, and integration tests are not implemented yet.
