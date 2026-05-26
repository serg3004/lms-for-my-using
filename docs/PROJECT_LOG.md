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

Uplated backend MVP skeleton modules:
- Assignments API skeleton
- Progress API skeleton
- Assessments API skeleton
- Assessment questions / answer options API skeleton

### Assessment media support

Added media support for assessment questions and answer options:

```text
AssessmentQuestion.imageUrl?
AssessmentAnswerOption.text?
AssessmentAnswerOption.imageUrl?
```

Answer options now support text-only, image-only, and text+image options. This allows authors to create mixed assessment formats such as text questions, image questions, single image choice, and multiple image choice while preserving automatic grading by selected option id.

Added migration:

```text
apps/api/prisma/migrations/20260526120000_add_assessment_media/migration.sql
```

### Current PR #43 check status

Local checks were not run in the GitHub API environment:

```text
[Check] Lint: not run
[Check] Prisma generate: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```

No database migration has been applied to any real database yet.
