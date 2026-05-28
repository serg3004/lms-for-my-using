# Project Log

## 2026-05-28

### Add learner course list web flow

Implemented PR 10 scope on `feat/learner-course-list`.

Changes:
- Added `/learn/courses` learner course list page in `apps/web`.
- Added frontend API client support for `GET /api/v1/courses`.
- Added loading, empty, error, missing-token, and `401 Unauthorized` states.
- Added navigation links from the app shell and learner landing page.
- Updated README, API status, project log, and audit log.

Deferred:
- Course detail UI.
- Enrollment/progress UI in the course list.
- Filters/search/sort controls.
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
[Check] Types: OK
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
