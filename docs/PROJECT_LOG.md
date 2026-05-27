# Project Log

## 2026-05-27

### Add MVP seed data

Implemented PR 6 scope on `chore/mvp-seed-data`.

Changes:
- Added `apps/api/prisma/seed.mjs`.
- Seed dataset includes 1 organization, 1 admin, 1 instructor, 2 learners, 1 group, 1 course, 2 lessons, 1 assignment, and 1 progress record.
- Seed script uses fixed IDs and Prisma `upsert` for idempotency.
- Seed users use local-only `example.test` emails and a local seed password printed by the script.
- Updated README, API status, project log, and audit log.

Deferred:
- Prisma schema/migration changes.
- CI/CD changes.
- Dependency changes.
- Package script changes.
- Real migration execution.

Current PR check status:

```text
[Check] Lint: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```

## 2026-05-27

### Add MVP local runbook

Implemented PR 5 scope on `docs/mvp-local-runbook`.

Changes:
- Added `docs/MVP_LOCAL_RUNBOOK.md`.
- Documented `.env` setup from `.env.example`.
- Documented local PostgreSQL and MinIO Docker Compose example without adding repo infrastructure files.
- Documented Prisma generate.
- Documented safe migration guardrails without applying real migrations.
- Documented API start, web start, and health check.
- Updated README, API status, project log, and audit log.

Current PR check status:

```text
[Check] Lint: OK
[Check] Types: OK
[Check] Tests: OK
[Check] Build: OK
```
