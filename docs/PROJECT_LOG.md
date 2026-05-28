# Project Log

## 2026-05-28

### Add learner-facing web flows

Implemented PR 9 scope on `feat/learner-web-flows`.

Changes:
- Added `/learn` learner landing page in `apps/web`.
- Added frontend API client support for `GET /api/v1/auth/me`.
- Redirected successful login from `/login` to `/learn`.
- Added basic missing-token and `401 Unauthorized` handling.
- Added learner profile summary display.
- Updated README, API status, project log, and audit log.

Deferred:
- Refresh token flow.
- Logout flow.
- Global state manager.
- Learner course list UI.
- Prisma schema/migration changes.
- CI/CD changes.
- Dependency changes.

Current PR check status:

```text
[Check] Lint: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```

## 2026-05-28

### Add web auth shell

Implemented PR 8 scope on `feat/web-auth-shell`.

Changes:
- Added `/login` shell in `apps/web`.
- Added frontend API client shell for `POST /api/v1/auth/login`.
- Added browser access token storage helper.
- Added basic auth error display on the login form.
- Updated README, API status, project log, and audit log.

Deferred:
- Refresh token flow.
- Logout flow.
- Global state manager.
- Prisma schema/migration changes.
- CI/CD changes.
- Dependency changes.

Current PR check status:

```text
[Check] Lint: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```

## 2026-05-28

### Add RBAC matrix and API contracts

Implemented PR 7 scope on `docs/rbac-matrix-api-contracts`.

Changes:
- Added `docs/RBAC_MATRIX.md`.
- Added `docs/API_CONTRACTS.md`.
- Documented the current MVP role policy map from `apps/api/src/modules/auth/roles.ts`.
- Documented the current MVP API contract baseline, common auth conventions, tenant scope rules, and error format.
- Updated README, API status, project log, and audit log.

Deferred:
- Runtime API changes.
- Prisma schema/migration changes.
- CI/CD changes.
- Dependency changes.

Current PR check status:

```text
[Check] Lint: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```

## 2026-05-27

### MVP seed data

Implemented MVP seed data scope on `chore/mvp-seed-data`.

Changes:
- Added standalone Prisma seed data script.
- Seed dataset includes 1 organization, 1 admin, 1 instructor, 2 learners, 1 group, 1 course, 2 lessons, 1 assignment, and 1 progress record.
- Updated README, API status, project log, and audit log.

Current PR check status:

```text
[Check] Lint: OK
[Check] Types: OK
[Check] Tests: OK
[Check] Build: OK
```
