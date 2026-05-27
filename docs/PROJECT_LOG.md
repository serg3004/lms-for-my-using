# Project Log

## 2026-05-27

### Users import skeleton

Implemented PR #49 scope on `feature/users-import-skeleton`.

Changes:
- Added `POST /api/v1/users/import`.
- Added Zod schema for JSON-only user import payloads.
- Added `validateOnly` mode for row-level validation report without writes.
- Added `create` mode that skips invalid, duplicate, and existing-email rows while creating valid rows.
- Added 100-row import batch limit.
- Added duplicate email detection inside import payload.
- Added existing organization email checks before writes.
- Added password hashing and Prisma transaction writes for created import rows.
- Reused `AuthGuard`, `RolesGuard`, `OrganizationScopeGuard`, and `usersCreate`.
- Added tests for validate-only report and partial create with skipped existing email.
- Updated README, API status, project log, and auto-change audit log.

Deferred by design:
- CSV upload `multipart/form-data`.
- Import file storage.
- Background jobs / queue.
- Import history table and related Prisma migration.
- Import UI.
- Email invitations.

### Current PR check status

Local checks were not run in the GitHub API environment:

```text
[Check] Lint: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```

## 2026-05-27

### Users bulk create

Implemented PR #48 scope on `feature/users-bulk-create`.

Changes:
- Added `POST /api/v1/users/bulk`.
- Added Zod schema for bulk user create payload.
- Added batch limit of 50 users per request.
- Added duplicate email validation inside the request payload.
- Added database duplicate email check before writes.
- Added transactional Prisma writes for bulk user creation.
- Added password hashing for each created user.
- Added service tests for happy path bulk create and duplicate database email rejection.
- Updated README, API status, project log, and auto-change audit log.

## 2026-05-26

### Assessment results / reports

Implemented PR #47 scope on `feature/assessment-results-reports`.

Changes:
- Added `AssessmentResultsService` for attempt result summaries, answer-level correctness, and aggregate reports.
- Added `GET /api/v1/assessments/:assessmentId/results`.
- Added `GET /api/v1/assessments/:assessmentId/report`.
- Added `GET /api/v1/attempts/:id/result`.
- Added learner access to own attempt result while preserving privileged organization access for admins/managers/instructors.
- Added tests for own result access, denied cross-learner access, and aggregate report calculation.
- Updated README, API status, project log, and auto-change audit log.

### Course completion gate

Implemented PR #46 scope on `feature/course-completion-gate`.

Changes:
- Added course completion calculation based on published lessons and completed lesson progress.
- Added `GET /api/v1/courses/:id/completion`.
- Enforced `Assessment.availableAfterCourseCompletion` before assessment attempt creation.
- Added service tests for course completion happy/incomplete paths.
- Added business test for rejecting gated assessment attempts before course completion.
- Updated README, API status, project log, and auto-change audit log.

## 2026-05-26

### Assessment attempts Prisma sync

Resolved the technical debt introduced in PR #44:

```text
AssessmentAttemptStatus
AssessmentAttempt
AssessmentAttemptAnswer
```

Changes:
- Synced assessment attempt tables into `apps/api/prisma/schema.prisma`.
- Added Prisma relations for attempts and attempt answers.
- Replaced parameterized raw SQL usage in `AssessmentAttemptsService` with Prisma Client calls.
- Kept the existing migration `20260526123000_add_assessment_attempts` as the database source for the already-added tables.
