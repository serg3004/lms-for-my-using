# Project Log

This file tracks completed project setup and implementation steps.

## 2026-05-24

### Documentation uploaded

Added project documentation to `docs/`.

### Monorepo foundation

Added base monorepo structure with `apps/api`, `apps/web`, `packages/shared`, `infra`, and CI baseline.

### Backend / frontend / shared skeletons

Added initial NestJS API skeleton, React/Vite frontend skeleton with i18n, and shared package.

### Prisma / database foundation

Added initial Prisma schema and migration with:

```text
Organization
User
Membership
```

No database migration was applied to any real database.

## 2026-05-25

### API environment / lint / test / CI baseline

Added Zod environment validation, ESLint flat config, safe test scripts, and full GitHub Actions CI:

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

Included Zod validation, Prisma-backed service, role assignment support, and tests.

### Auth foundation

Implemented:

```text
POST /api/v1/auth/login
GET  /api/v1/auth/me
```

Added login validation, current user response shape, active user lookup, and password hash exclusion from responses.

### Password hashing flow

Added password hashing and verification using Node `crypto.scrypt`.

Current behavior:

```text
POST /api/v1/users accepts plaintext password input
only passwordHash is stored
login validates password against passwordHash
passwordHash is never returned in API responses
```

### User position / shift

Added nullable user fields:

```text
position
shift
```

Updated Prisma schema, migration, API response shape, validation, and tests.

Migration:

```text
apps/api/prisma/migrations/20260525110000_add_user_position_shift/migration.sql
```

### JWT login / current user

Implemented JWT login and current user flow:

```text
POST /api/v1/auth/login
GET  /api/v1/auth/me
```

Current behavior:

```text
JWT_SECRET is required and must be at least 32 characters
token signing and verification use internal Node crypto HS256 helper
current user is resolved from access token
```

### AuthGuard

Added reusable `AuthGuard`.

Applied it to implemented protected read endpoints:

```text
GET /api/v1/organizations
GET /api/v1/organizations/:id
GET /api/v1/users
GET /api/v1/users/:id
GET /api/v1/memberships
GET /api/v1/memberships/:id
```

### RBAC foundation

Added reusable RBAC foundation:

```text
Roles decorator
RolesGuard
shared role policy map
Membership-backed role checks
```

Current role policies:

```text
organizations read: admin
users read: admin, manager
memberships read: admin, manager
memberships create: admin
```

### Organization scope guard

Added tenant isolation foundation:

```text
OrganizationScope decorator
OrganizationScopeGuard
currentUser.organizationId scope checks
```

Current behavior:

```text
organization, user, and membership reads are scoped to current user organization
POST /api/v1/memberships requires body.organizationId to match current user organization
```

### Documentation sync

Updated:

```text
README.md
docs/API_STATUS.md
.github/auto-changes.log
docs/PROJECT_LOG.md
```

### Groups API

Implemented Groups API:

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

Current policies:

```text
groups read: admin, manager
groups create: admin, manager
```

Group reads are scoped to current user organization.
Group creation requires `body.organizationId` to match current user organization.

### Courses API skeleton

Implemented Courses API skeleton:

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

Current policies:

```text
courses read: admin, manager, instructor
courses create: admin, instructor
```

Course reads are scoped to current user organization.
Course creation requires `body.organizationId` to match current user organization.

### Lessons API skeleton

Implemented Lessons API skeleton:

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

Current policies:

```text
lessons read: admin, manager, instructor
lessons create: admin, instructor
```

Lesson reads are scoped to current user organization.
Lesson creation requires `body.organizationId` to match current user organization and route `courseId` to belong to the same organization.

Scope limitation:

```text
Lessons API is a skeleton.
Lesson materials, content blocks, assignments, progress, assessments, and certificates are not implemented yet.
```

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

Continue LMS module implementation:

```text
Course materials / files API skeleton
Assignments API skeleton
Progress API skeleton
Extend RBAC policies as new LMS modules are implemented
OpenAPI
Centralized API error format
Integration tests
```

No database migration has been applied to any real database yet.
