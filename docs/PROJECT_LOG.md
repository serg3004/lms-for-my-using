# Project Log

## 2026-05-28

### Add learner assignment list/detail web flow

Implemented PR 17 scope on `feature/learner-assignments`.

Changes:
- Added frontend API client support for `GET /api/v1/assignments` and `GET /api/v1/assignments/:id`.
- Added `/learn/assignments` learner assignment list page in `apps/web`.
- Added `/learn/assignments/:id` learner assignment detail page in `apps/web`.
- Linked learner home and app navigation to assignments.
- Added loading, empty, error, missing-token, `401 Unauthorized`, and `404 Not Found` states.
- Added assignments i18n copy for `en` and `ru`.
- Updated README, API status, project log, and audit log.

Deferred:
- Assignment submission UI.
- Assignment upload UI.
- Grading/review UI.
- Assignment filters/search/sort.
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

### Add lesson completion action

Implemented PR 16 scope on `feature/lesson-completion-action`.

## 2026-05-28

### Add learner progress web flow

Implemented PR 15 scope on `feature/learner-progress`.

## 2026-05-28

### Add learner lesson materials web flow

Implemented PR 14 scope on `feature/learner-lesson-materials`.

## 2026-05-28

### Add learner lesson detail web flow

Implemented PR 13 scope on `feat/learner-lesson-detail`.

## 2026-05-28

### Add learner lessons list web flow

Implemented PR 12 scope on `feat/learner-lessons-list`.

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
