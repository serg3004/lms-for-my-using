# Project Log

## 2026-05-28

### Add learner lessons list web flow

Implemented PR 12 scope on `feat/learner-lessons-list`.

Changes:
- Added `/learn/courses/:id/lessons` learner lessons list page in `apps/web`.
- Added frontend API client support for `GET /api/v1/courses/:courseId/lessons`.
- Linked course detail pages to the lessons list.
- Added loading, empty, error, missing-token, `401 Unauthorized`, and `404 Not Found` states.
- Updated README, API status, project log, and audit log.

Deferred:
- Lesson detail UI.
- Lesson materials UI.
- Progress UI.
- Enrollment UI.
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

### Add learner course detail web flow

Implemented PR 11 scope on `feat/learner-course-detail`.

## 2026-05-28

### Add learner course list web flow

Implemented PR 10 scope on `feat/learner-course-list`.

## 2026-05-28

### Add learner-facing web flows

Implemented PR 9 scope on `feat/learner-web-flows`.

## 2026-05-28

### Add web auth shell

Implemented PR 8 scope on `feat/web-auth-shell`.
