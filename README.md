# lms-for-my-using

Learning management system.

## Project status

Current stage: early MVP foundation.

Implemented backend modules:
- Health API
- Organizations API
- Organization registration / first admin flow
- Users API
- Users bulk create API
- Users import skeleton API
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
- Assessment results and reports API skeleton

## Implemented backend API

```text
GET  /api/v1/health

GET  /api/v1/organizations
GET  /api/v1/organizations/:id
POST /api/v1/organizations
POST /api/v1/organizations/register

GET  /api/v1/users
GET  /api/v1/users/:id
POST /api/v1/users
POST /api/v1/users/bulk
POST /api/v1/users/import

GET   /api/v1/memberships
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
GET  /api/v1/assessments/:assessmentId/results
GET  /api/v1/assessments/:assessmentId/report
GET  /api/v1/attempts/:id
GET  /api/v1/attempts/:id/result
POST /api/v1/assessments/:assessmentId/attempts

POST /api/v1/auth/login
GET  /api/v1/auth/me
```

## Organization registration / first admin flow

`POST /api/v1/organizations/register` creates a new organization, first admin user, and admin membership in one transactional flow.

The endpoint:
- accepts public registration input with `organization` and `admin` sections;
- validates input with Zod;
- normalizes admin email to lowercase;
- rejects duplicate active organization slugs;
- rejects duplicate active admin emails;
- hashes the first admin password before writing;
- creates organization, user, and `admin` membership in one Prisma transaction;
- returns organization and first admin summaries without password hash.

## Users bulk create

`POST /api/v1/users/bulk` creates up to 50 users for one organization in one request.

The endpoint:
- requires `AuthGuard`, `RolesGuard`, and `OrganizationScopeGuard;
- uses the existing `usersCreate` role policy;
- validates input with Zod;
- normalizes emails to lowercase;
- rejects duplicate emails inside the request payload;
- rejects emails that already exist in the target organization;
- hashes each password before writing users.

## Users import skeleton

`POST /api/v1/users/import` provides the first backend import flow without CSV upload, file storage, queues, import history tables, UI, or email invitations.

Supported modes:
- `validateOnly` — validates rows and returns a row-level report without writes.
- `create` — validates rows, skips invalid/existing/duplicate emails, and creates valid rows.

The endpoint:
- accepts JSON payloads only;
- supports up to 100 rows per request;
- returns `createdCount`, `skippedCount`, `errorCount`, and per-row errors;
- reuses password hashing, Prisma transactions, `usersCreate`, and organization scope checks.

## Deferred import features

Deferred until after MVP / separate PRs:
- CSV upload `multipart/form-data`;
- import file storage;
- background jobs / queue;
- import history table and related Prisma migration;
- import UI;
- email invitations.

## Course completion gate

Course completion is calculated from published lessons and completed lesson progress for the current authenticated user.

`GET /api/v1/courses/:id/completion` returns:
- total published lessons;
- completed lessons;
- completion flag;
- completion percentage.

Assessment attempts are blocked when `Assessment.availableAfterCourseCompletion = true` and the learner has not completed all published course lessons.

## Assessment results and reports

Assessment results are available through:
- `GET /api/v1/assessments/:assessmentId/results` for organization instructors/managers/admins;
- `GET /api/v1/assessments/:assessmentId/report` for aggregate assessment reporting;
- `GET /api/v1/attempts/:id/result` for own learner result or privileged organization roles.

Attempt result responses include score, max score, percentage, passed flag, assessment/user summary, and answer-level correctness summary.

## Current Prisma baseline

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20260526123000_add_assessment_attempts/migration.sql
```

No database migration has been applied to any real database yet.

## Planned next steps

1. Certificates skeleton.
2. Centralized API error format.
3. OpenAPI / Swagger skeleton.
4. Integration tests.
5. Deployment readiness.
