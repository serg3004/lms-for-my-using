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
- Assessments API skeleton
- Assessment questions / answer options API skeleton
- Assessment media support for questions/options
- Assessment attempts / automatic grading API skeleton

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
GET  /api/v1/assessments
GET  /api/v1/assessments/:id
POST /api/v1/assessments
GET  /api/v1/assessments/:assessmentId/questions
GET  /api/v1/questions/:id
POST /api/v1/assessments/:assessmentId/questions
GET  /api/v1/questions/:questionId/options
POST /api/v1/questions/:questionId/options
GET  /api/v1/assessments/:assessmentId/attempts
GET  /api/v1/attempts/:id
POST /api/v1/assessments/:assessmentId/attempts
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
assessments read: admin, manager, instructor
assessments create: admin, instructor
assessment questions read: admin, manager, instructor
assessment questions create: admin, instructor
assessment answer options read: admin, manager, instructor
assessment answer options create: admin, instructor
assessment attempts read: admin, manager, instructor
assessment attempts create: admin, manager, instructor, learner
```

## Assessment attempt grading

```text
single_choice and true_false require selectedOptionId.
multiple_choice requires selectedOptionIds.
All assessment questions must be answered.
Duplicate question answers are rejected.
Selected options must belong to their question.
Score is sum of points for fully correct answers.
percentage = round(score / maxScore * 100).
passed = percentage >= assessment.passingScore.
assessment.maxAttempts is enforced when provided.
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
apps/api/prisma/migrations/20260526110000_add_assessments/migration.sql
apps/api/prisma/migrations/20260526113000_add_assessment_questions/migration.sql
apps/api/prisma/migrations/20260526120000_add_assessment_media/migration.sql
apps/api/prisma/migrations/20260526123000_add_assessment_attempts/migration.sql
```

No database migration has been applied to any real database yet.

## Planned next steps

1. Course completion gate for final assessment.
2. Assessment results / reports.
3. Users bulk create.
4. Users import skeleton.
5. Organization registration / first admin flow.
6. Certificates skeleton.
7. Centralized API error format.
8. OpenAPI / Swagger skeleton.
9. Integration tests.
10. Deployment readiness.
