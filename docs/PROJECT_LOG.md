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

### Groups API

Implemented:

```text
GET  /api/v1/groups
GET  /api/v1/groups/:id
POST /api/v1/groups
```

### Courses API skeleton

Implemented:

```text
GET  /api/v1/courses
GET  /api/v1/courses/:id
POST /api/v1/courses
```

### Lessons API skeleton

Implemented:

```text
GET  /api/v1/courses/:courseId/lessons
GET  /api/v1/lessons/:id
POST /api/v1/courses/:courseId/lessons
```

### Course materials / files API skeleton

Implemented:

```text
GET  /api/v1/courses/:courseId/materials
GET  /api/v1/materials/:id
POST /api/v1/courses/:courseId/materials
```

### Assignments API skeleton

Implemented:

```text
GET  /api/v1/assignments
GET  /api/v1/assignments/:id
POST /api/v1/assignments
```

## 2026-05-26

### Progress API skeleton

Implemented:

```text
GET  /api/v1/progress
GET  /api/v1/progress/:id
POST /api/v1/progress
```

### Assessments API skeleton

Implemented:

```text
GET  /api/v1/assessments
GET  /api/v1/assessments/:id
POST /api/v1/assessments
```

Added Prisma model and migration:

```text
Assessment
AssessmentStatus
apps/api/prisma/migrations/20260526110000_add_assessments/migration.sql
```

Current policies:

```text
assessments read: admin, manager, instructor
assessments create: admin, instructor
```

Assessments are prepared for future automatic grading after course completion with:

```text
passingScore
maxAttempts
availableAfterCourseCompletion
```

### Current PR #41 check status

Local checks were not run in the GitHub API environment:

```text
[Check] Lint: not run
[Check] Prisma generate: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```

### Current next step

```text
Assessment questions / answer options API skeleton
Assessment attempts / automatic grading
Course completion gate for final assessment
OpenAPI
Centralized API error format
Integration tests
```

No database migration has been applied to any real database yet.
