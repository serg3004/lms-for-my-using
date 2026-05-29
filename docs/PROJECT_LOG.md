# Project Log

## 2026-05-29

### Add admin layout and dashboard

Implemented PR 23 scope on `feat/admin-layout-dashboard`.

Changes:
- Added `/admin` web route.
- Added `AdminDashboardPage` shell.
- Reused existing auth token and `GET /api/v1/auth/me` flow.
- Added loading, missing token, `401 Unauthorized`, and generic error states.
- Added basic admin sidebar/dashboard links for users, roles, org structure, courses, assessments, and reports.
- Added `/admin` link to root navigation.
- Updated README, API status, project log, and audit log.

Deferred:
- Admin role-specific frontend guard.
- User management UI.
- Role assignment UI.
- Org structure UI.
- Course builder.
- Assessment builder.
- Reports dashboard.
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

## 2026-05-29

### Add workspace registration/login/logout hardening

Implemented PR 22 scope on `fix/workspace-registration-login-logout-hardening`.

Changes:
- Added authenticated `POST /api/v1/auth/logout`.
- Logout validates bearer token and active user status before returning a stateless acknowledgement.
- Added `AuthService.logout()` result.
- Added web logout helper that clears the stored access token in `finally`.
- Added controller tests for missing bearer token and valid logout flow.
- Updated README, API status, project log, and audit log.

## 2026-05-29

### Fix assessment attempt eligibility and API error contract

Implemented PR 21 scope on `fix/assessment-attempt-eligibility-api-error-contract`.

Changes:
- Added assessment status selection in assessment attempt creation.
- Rejected attempts for `draft` and `archived` assessments.
- Kept attempts allowed for `published` assessments when existing gates pass.
- Aligned shared `ApiErrorResponse` with the backend error envelope.
- Added service tests for published, draft, and archived assessment attempt eligibility.

## 2026-05-28

### Secure public user and organization creation

Implemented PR 20 scope on `fix/secure-public-user-organization-creation`.

Changes:
- Added auth, RBAC, and organization scope guard to direct `POST /api/v1/users`.
- Added auth and admin RBAC guard to direct `POST /api/v1/organizations`.
- Kept `POST /api/v1/organizations/register` public as the explicit workspace registration flow.
- Added `rolePolicies.organizationsCreate`.
- Added controller tests for protected direct creation endpoints and public registration metadata.
