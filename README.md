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
- Course completion check by lesson progress
- Assessments API skeleton
- Assessment questions / answer options API skeleton
- Assessment media support for questions/options
- Assessment attempts / automatic grading API skeleton
- Course completion gate for gated assessment attempts

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
GET  /api/v1/courses/:id/completion
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

## Course completion gate

Course completion is calculated from published lessons and completed lesson progress for the current authenticated user.

`GET /api/v1/courses/:id/completion` returns:
- total published lessons;
- completed lessons;
- completion flag;
- completion percentage.

Assessment attempts are blocked when `Assessment.availableAfterCourseCompletion = true` and the learner has not completed all published course lessons.

## Assessment attempts

Assessment attempt models are synchronized in `apps/api/prisma/schema.prisma` and the attempts service uses Prisma Client for attempt tables instead of raw SQL.

```text
AssessmentAttempt
AssessmentAttemptAnswer
AssessmentAttemptStatus
```

Automatic grading supports:
- `single_choice`
- `multiple_choice`
- `true_false`

## Current Prisma baseline

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20260526123000_add_assessment_attempts/migration.sql
```

No database migration has been applied to any real database yet.

## Planned next steps

1. Assessment results / reports.
2. Users bulk create.
3. Users import skeleton.
4. Organization registration / first admin flow.
5. Certificates skeleton.
6. Centralized API error format.
7. OpenAPI / Swagger skeleton.
8. Integration tests.
9. Deployment readiness.
