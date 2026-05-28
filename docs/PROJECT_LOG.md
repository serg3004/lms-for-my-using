# Project Log

## 2026-05-28

### Add learner course detail web flow

Implemented PR 11 scope on `feat/learner-course-detail`.

Changes:
- Added `/learn/courses/:id` learner course detail page in `apps/web`.
- Added frontend API client support for `GET /api/v1/courses/:id`.
- Linked course titles from `/learn/courses` to the detail page.
- Added loading, error, missing-token, `401 Unauthorized`, and `404 Not Found` states.
- Updated README, API status, project log, and audit log.

Deferred:
- Lessons list UI.
- Progress UI.
- Enrollment UI.
- Course edit/create UI.
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

### Add learner course list web flow

Implemented PR 10 scope on `feat/learner-course-list`.

Changes:
- Added `/learn/courses` learner course list page in `apps/web`.
- Added frontend API client support for `GET /api/v1/courses`.
- Added loading, empty, error, missing-token, and `401 Unauthorized` states.
- Added navigation links from the app shell and learner landing page.
- Updated README, API status, project log, and audit log.

## 2026-05-28

### Add learner-facing web flows

Implemented PR 9 scope on `feat/learner-web-flows`.

## 2026-05-28

### Add web auth shell

Implemented PR 8 scope on `feat/web-auth-shell`.
