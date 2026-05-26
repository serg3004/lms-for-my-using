# Project Log

## 2026-05-26

### Course completion gate

Implemented PR #46 scope on `feature/course-completion-gate`.

Changes:
- Added course completion calculation based on published lessons and completed lesson progress.
- Added `GET /api/v1/courses/:id/completion`.
- Enforced `Assessment.availableAfterCourseCompletion` before assessment attempt creation.
- Added service tests for course completion happy/incomplete paths.
- Added business test for rejecting gated assessment attempts before course completion.
- Updated README, API status, project log, and auto-change audit log.

### Current PR check status

Local checks were not run in the GitHub API environment:

```text
[Check] Lint: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```

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
