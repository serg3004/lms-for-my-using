# Project Log

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

Deferred:
- Prisma schema/migration changes.
- CI/CD changes.
- Dependency changes.
- Deploy scripts.
- Real migration execution.
- Seed data.

Current PR check status:

```text
[Check] Lint: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```

## 2026-05-27

### Add MVP Definition of Done and Pilot Checklist

Implemented PR 4 scope on `docs/mvp-dod-pilot-checklist`.

Changes:
- Added `docs/MVP_DEFINITION_OF_DONE.md`.
- Added `docs/PILOT_CHECKLIST.md`.
- Updated README with MVP docs references.
- Updated API status, project log, and audit log.

Current PR check status:

```text
[Check] Lint: OK
[Check] Types: OK
[Check] Tests: OK
[Check] Build: OK
```
