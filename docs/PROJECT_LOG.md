# Project Log

## 2026-05-28

### Secure public user and organization creation

Implemented PR 20 scope on `fix/secure-public-user-organization-creation`.

Changes:
- Added auth, RBAC, and organization scope guard to direct `POST /api/v1/users`.
- Added auth and admin RBAC guard to direct `POST /api/v1/organizations`.
- Kept `POST /api/v1/organizations/register` public as the explicit workspace registration flow.
- Added `rolePolicies.organizationsCreate`.
- Added controller tests for protected direct creation endpoints and public registration metadata.
- Updated README, API status, project log, and audit log.

Deferred:
- Prisma schema/migration changes.
- CI/CD changes.
- Dependency changes.
- Frontend redesign.
- Workspace registration hardening beyond existing public register flow.

Current PR check status:

```text
[Check] Lint: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```

## 2026-05-28

### Add learner certificate/report shell

Implemented PR 19 scope on `feature/learner-certificate-report-shell`.

Changes:
- Added frontend API client support for `GET /api/v1/certificates` and `GET /api/v1/certificates/:id`.
- Added `/learn/certificates` learner certificate list page in `apps/web`.
- Added `/learn/certificates/:id` learner certificate detail page in `apps/web`.
- Linked learner home and app navigation to certificates.
- Added loading, empty, error, missing-token, `401 Unauthorized`, and `404 Not Found` states.
- Added certificates i18n copy for `en` and `ru`.
- Updated README, API status, project log, and audit log.

Deferred:
- Certificate generation UI.
- Certificate download/export/PDF UI.
- Reports UI.
- Filters/search/sort.
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

### Add learner assessment list/detail web flow

Implemented PR 18 scope on `feature/learner-assessments`.

## 2026-05-28

### Add learner assignment list/detail web flow

Implemented PR 17 scope on `feature/learner-assignments`.

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

Implemented PR 9 scope on `feature/learner-web-flows`.

## 2026-05-28

### Add web auth shell

Implemented PR 8 scope on `feat/web-auth-shell`.
