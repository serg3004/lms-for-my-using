# Project Log

This file tracks completed project setup and implementation steps.

## 2026-05-24

### Project foundation

Added project documentation, monorepo foundation, API skeleton, frontend skeleton, shared package, Prisma/database foundation, local Docker services, and GitHub Actions CI baseline.

Initial Prisma models:

```text
Organization
User
Membership
```

No database migration was applied to any real database.

## 2026-05-25

### Backend foundation

Added API environment validation, ESLint flat config, safe test scripts, and full CI checks:

```text
pnpm install --frozen-lockfile
pnpm --recursive lint
pnpm --filter @lms/api prisma:generate
pnpm --recursive typecheck
pnpm --recursive test
pnpm --recursive build
```

### Users API

Implemented:

```text
GET  /api/v1/users
GET  /api/v1/users/:id
POST /api/v1/users
```

Included Zod validation, Prisma-backed service, password input handling, and tests.

### Memberships / roles API

Implemented:

```text
GET  /api/v1/memberships
GET  /api/v1/memberships/:id
POST /api/v1/memberships
```

### Auth foundation, password hashing, JWT, guards

Implemented:

```text
POST /api/v1/auth/login
GET  /api/v1/auth/me
AuthGuard
RolesGuard
OrganizationScopeGuard
```

Added password hashing with Node `crypto.scrypt`, JWT login/current user flow, RBAC foundation, and organization scope guard.

### User position / shift

Added nullable user fields:

```text
position
shift
```

### Groups API

Implemented:

```text
GET  /api/v1/groups
GET  /api/v1/groups/:id
POST /api/v1/groups
```

Added Prisma model and migration:

```text
Group
GroupStatus
apps/api/prisma/migrations/20260525160000_add_groups/migration.sql
```

### Courses API skeleton

Implemented:

```text
GET  /api/v1/courses
GET  /api/v1/courses/:id
POST /api/v1/courses
```

Added Prisma model and migration:

```text
Course
CourseStatus
apps/api/prisma/migrations/20260525163000_add_courses/migration.sql
```

### Lessons API skeleton

Implemented:

```text
GET  /api/v1/courses/:courseId/lessons
GET  /api/v1/lessons/:id
POST /api/v1/courses/:courseId/lessons
```

Added Prisma model and migration:

```text
Lesson
LessonStatus
apps/api/prisma/migrations/20260525170000_add_lessons/migration.sql
```

### Course materials / files API skeleton

Implemented:

```text
GET  /api/v1/courses/:courseId/materials
GET  /api/v1/materials/:id
POST /api/v1/courses/:courseId/materials
```

Added Prisma model and migration:

```text
CourseMaterial
CourseMaterialStatus
CourseMaterialKind
apps/api/prisma/migrations/20260525173000_add_course_materials/migration.sql
```

Current policies:

```text
course materials read: admin, manager, instructor
course materials create: admin, instructor
```

Materials can be attached to a course and optionally to a lesson through `lessonId`.
The optional lesson must belong to the same course and organization.

### Current CI result

Current automated CI status:

```text
[Check] Lint: OK
[Check] Prisma generate: OK
[Check] Types: OK
[Check] Tests: OK
[Check] Build: OK
```

### Current next step

```text
Assignments API skeleton
Progress API skeleton
Extend RBAC policies as new LMS modules are implemented
OpenAPI
Centralized API error format
Integration tests
```

No database migration has been applied to any real database yet.
