# Project Log

## 2026-05-27

### Add MVP Definition of Done and Pilot Checklist

Implemented PR 4 scope on `docs/mvp-dod-pilot-checklist`.

Changes:
- Added `docs/MVP_DEFINITION_OF_DONE.md`.
- Added `docs/PILOT_CHECKLIST.md`.
- Updated README with MVP docs references.
- Updated API status, project log, and audit log.

Deferred:
- Prisma schema/migration changes.
- CI/CD changes.
- Dependency changes.
- Runtime API changes.

Current PR check status:

```text
[Check] Lint: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```

## 2026-05-27

### Add MVP API smoke coverage

Implemented PR 3 scope on `test/mvp-api-smoke-coverage`.

Changes:
- Expanded API integration smoke coverage for health.
- Added auth login happy path smoke coverage.
- Kept auth login invalid body negative coverage.
- Added protected endpoint without bearer token smoke coverage.
- Added tenant scope mismatch negative smoke coverage.
- Kept env validation coverage in `apps/api/src/config/env.spec.ts`.
- Updated README, API status, project log, and audit log.

Current PR check status:

```text
[Check] Lint: OK
[Check] Types: OK
[Check] Tests: OK
[Check] Build: OK
```
