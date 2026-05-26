# lms-for-my-using

Learning management system.

## Project status

Current stage: early MVP foundation.

Implemented backend modules:
- Health API
- Organizations API
- Users API
- Memberships / roles API
- Auth login/current user
- AuthGuard
- RolesGuard / RBAC
- OrganizationScopeGuard
- Groups API
- Courses API skeleton
- Lessons API skeleton
- Course materials / files API skeleton
- Assignments API skeleton
- Progress API skeleton

## Implemented backend API

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
POST /api/v1/auth/login
GET  /api/v1/auth/me
```

## Current RBAC

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

## Current scope rules

```text
Read endpoints are scoped to current user organization.
Create endpoints with organizationId require body.organizationId to match current user organization.
Course materials optional lessonId must belong to the same course and organization.
Assignments target exactly one userId or groupId.
Assignment courseId, userId, and groupId must belong to current user organization.
Progress courseId and userId must belong to current user organization.
Progress lessonId, if provided, must belong to the same course and organization.
Progress score, if provided, must be 0..100.
```

## Current Prisma baseline

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20260524115000_init/migration.sql
apps/api/prisma/migrations/20260525110000_add_user_position_shift/migration.sql
apps/api/prisma/migrations/20260525160000_add_groups/migration.sql
apps/api/prisma/migrations/20260525163000_add_courses/migration.sql
apps/api/prisma/migrations/20260525170000_add_lessons/migration.sql
apps/api/prisma/migrations/20260525173000_add_course_materials/migration.sql
apps/api/prisma/migrations/20260526090000_add_assignments/migration.sql
apps/api/prisma/migrations/20260526100000_add_progress/migration.sql
```

No database migration has been applied to any real database yet.

## Planned next steps

1. Assessments API skeleton.
2. OpenAPI.
3. Centralized API error format.
4. Integration tests.
