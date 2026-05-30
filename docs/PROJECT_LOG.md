# Project Log

## 2026-05-30

### Auth/session hardening series

Implemented PR 39–42 scope across `fix/auth-session-jwt-hardening`, `test/auth-session-token-negative-cleanup`, `fix/current-user-lookup-hardening`, and `test/auth-guard-logout-behavior`.

Changes:
- Hardened custom JWT verification:
  - strict 3-segment token structure validation;
  - protected JWT header validation for `alg: HS256` and `typ: JWT`;
  - safe JSON object parsing for JWT header and claims;
  - integer validation for `iat` and `exp`;
  - rejection of future `iat`;
  - rejection of invalid token lifetime where `exp <= iat`.
- Cleaned up JWT negative token tests and added signed malformed-claims coverage.
- Bound current user lookup to JWT `sub` in addition to `organizationId`, `email`, `active` status, and `deletedAt: null`.
- Added AuthGuard bearer parsing coverage for missing, empty, malformed, lowercase, padded, and multiple authorization header values.
- Added logout bearer behavior tests for missing/empty/invalid bearer headers and token validation before logout acceptance.
- Kept PR 42 test-only with no runtime auth changes.

Current auth/session status:
- Access tokens are stateless JWT access tokens signed with `HS256`.
- Current user lookup is bound to the token subject/user id.
- Logout is stateless and validates the bearer token before returning `{ accepted: true }`.
- Password reset endpoints remain implemented as unavailable skeleton endpoints.

Current PR check status:
```text
[Check] Lint: CI OK for merged PRs where reported
[Check] Types: CI OK for merged PRs where reported
[Check] Tests: CI OK for merged PRs where reported
[Check] Build: CI OK for merged PRs where reported
```

Deferred:
- Refresh token/httpOnly cookie implementation.
- Login rate limiting.
- Password reset real flow.
- Token revocation/session store.
- Auth/session docs beyond current README/project status sync.

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
