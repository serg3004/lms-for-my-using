# Project Log

This file tracks completed project setup and implementation steps.

## 2026-05-24

### Project foundation

Added project documentation, monorepo foundation, API skeleton, frontend skeleton, shared package, Prisma/database foundation, local Docker services, and GitHub Actions CI baseline.

## 2026-05-25

Implemented backend foundation modules:
- Users API
- Memberships / roles API
- Auth foundation, password hashing, JWT, guards
- Groups API
- Courses API skeleton
- Lessons API skeleton
- Course materials / files API skeleton

## 2026-05-26

Updated backend MVP skeleton modules:
- Assignments API skeleton
- Progress API skeleton
- Assessments API skeleton
- Assessment questions / answer options API skeleton
- Assessment media support for questions/options

### Assessment attempts / automatic grading API skeleton

Implemented:

```text
GET  /api/v1/assessments/:assessmentId/attempts
GET  /api/v1/attempts/:id
POST /api/v1/assessments/:assessmentId/attempts
```

Added migration:

```text
apps/api/prisma/migrations/20260526123000_add_assessment_attempts/migration.sql
```

Added automatic grading MVP for:

```text
single_choice
multiple_choice
true_false
```

Current grading behavior:

```text
single_choice and true_false require selectedOptionId.
multiple_choice requires selectedOptionIds.
All assessment questions must be answered.
Duplicate answers for one question are rejected.
Score is calculated from question points.
percentage is rounded from score / maxScore.
passed is calculated by assessment.passingScore.
assessment.maxAttempts is enforced when provided.
```

### Current PR #44 check status

Local checks were not run in the GitHub API environment:

```text
[Check] Lint: not run
[Check] Prisma generate: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```

No database migration has been applied to any real database yet.
