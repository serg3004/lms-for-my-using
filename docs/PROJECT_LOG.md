# Project Log

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

### Current PR check status

Local checks were not run in the GitHub API environment:

```text
[Check] Lint: not run
[Check] Prisma generate: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```
