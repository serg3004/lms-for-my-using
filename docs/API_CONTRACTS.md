# API Contracts

Status recalculated: 2026-08-06 (merged with the former `docs/API_STATUS.md`, which is now retired).

This document captures the current MVP API contract baseline and the current backend implementation status. Runtime source of truth remains the controllers, schemas, and services under `apps/api/src`.

## Current status

The API baseline is deployed to production (`web-production-b1f01.up.railway.app`) and covers auth, org/user/group/membership management, courses/lessons/materials, assignments, progress, assessments (questions/options/attempts/results/report), certificates, and theme settings.

Implemented backend/API baseline:

- Health endpoints (`/health`, `/health/live`, `/health/ready`).
- Auth: login, refresh, logout, logout-all, current user, password reset request/confirm.
- Organization registration, protected organization management, theme settings, logo upload.
- Users, groups (with member/manager sub-resource management), memberships endpoints.
- Courses (with instructor sub-resource management), lessons (with ordering), materials (including multipart upload and malware-scan callback), assignments, progress, assessments, assessment questions/options, attempts/results/report, and certificates endpoints.
- Centralized API error response envelope.
- Manual OpenAPI document synced with current controllers.
- Runtime API environment validation.
- Refresh token / httpOnly cookie session store, CSRF double-submit protection, Redis-backed rate limiting with in-memory fallback.
- RBAC: role-policy layer (`RolesGuard`) plus object-level course/group scoping (`CourseAccessGuard`, `manager-team-scope`) — see `docs/API_RBAC_MATRIX.md`.
- Backend MVP flow smoke coverage, CI quality gates for lint, typecheck, tests, build, and Prisma generate.

Known gaps (see `docs/MVP_READINESS_DASHBOARD.md` and `docs/CONCERNS.md` for full detail):

- No dedicated audit-log or notifications module (open product question, tracked in `docs/CONCERNS.md`).
- Production has no provisioned Redis service; rate limiting currently runs on the in-memory fallback via `ALLOW_IN_MEMORY_RATE_LIMIT`.
- The list-query consistency plan below is only partially implemented (see status note in that section).

## Common conventions

Base path:

```text
/api/v1
```

Authentication:

- Access token is a stateless JWT, delivered via httpOnly cookie (web) or `Authorization: Bearer <accessToken>`.
- Refresh tokens rotate and are stored server-side (`Session` model); see `docs/AUTH_SESSION_STORE_DESIGN.md`.

Tenant context:

- Authenticated requests resolve `organizationId` from the current user.
- Scoped writes that accept `organizationId` must match the current user's organization.

Error shape:

```json
{
  "statusCode": 400,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed"
  },
  "path": "/api/v1/example",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

Error response rules:

- Error responses should use the shared `ApiErrorResponse` shape from `apps/api/src/common/api-response.ts`.
- `statusCode` must match the HTTP status code.
- `error.code` must be stable and machine-readable.
- `error.message` must be safe to show to API clients.
- `error.details` is optional and should be used for field-level validation details.
- `path` should preserve the request path that produced the error.
- `timestamp` must be an ISO timestamp.

Zod validation errors return `400 Bad Request` with `VALIDATION_ERROR`.

## List query consistency plan

Status: **partially implemented.** `apps/api/src/common/pagination.schema.ts` (`paginationQuerySchema`) provides the `page`/`pageSize` query-param contract described below and is used by 6 list controllers. The paginated response shape (`items`/`page`/`pageSize`/`total`/`totalPages`) described below has **not** been implemented anywhere in the codebase — list endpoints that use `paginationQuerySchema` still return plain arrays. Treat the response-shape section as a forward-looking plan, not current behavior.

Target query parameters for collection endpoints:

| Parameter | Type | Default | Limit | Notes |
| --- | --- | --- | --- | --- |
| `page` | positive integer | `1` | min `1` | One-based page number. |
| `pageSize` | positive integer | `20` | max `200` | Requests above max should fail validation or clamp only if explicitly documented. |
| `sortBy` | string enum | endpoint-specific | allowlist only | Never pass arbitrary client field names directly into Prisma. |
| `sortDirection` | `asc` / `desc` | `asc` | enum only | Applies only with a valid `sortBy`. |
| `search` | string | none | trim, bounded length | Optional text search where the endpoint has safe searchable fields. |
| endpoint filters | typed query params | none | schema-defined | Examples: `status`, `courseId`, `lessonId`, `userId`, `groupId`. |

Target paginated response shape (not yet implemented — see status note above):

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0,
  "totalPages": 0
}
```

Implementation rules:

- Query parameters must use Zod runtime validation.
- Service queries must use Prisma.
- Sort fields must be explicit per endpoint allowlists.
- Filters must stay organization-scoped.
- Existing unpaginated list responses must not change silently; each endpoint needs tests and OpenAPI/docs sync in the same PR that changes its runtime contract.
- Frontend clients must be updated in the same PR as any response-shape change for an endpoint.

Suggested rollout order:

1. Add shared backend response DTO type (query schema helper already exists as `paginationQuerySchema`).
2. Migrate low-risk admin lists: users, groups, memberships.
3. Migrate learning content lists: courses, lessons, materials.
4. Migrate learner-facing lists: assignments, progress, assessments, certificates.
5. Sync manual OpenAPI and frontend domain modules after each endpoint batch.

## Backend API route map

```text
GET  /api/v1/health
GET  /api/v1/health/live
GET  /api/v1/health/ready
GET  /api/v1/openapi

POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
POST /api/v1/auth/logout-all
POST /api/v1/auth/password-reset/request
POST /api/v1/auth/password-reset/confirm
GET  /api/v1/auth/me

GET    /api/v1/organizations
POST   /api/v1/organizations
POST   /api/v1/organizations/register
GET    /api/v1/organizations/:id
GET    /api/v1/organizations/:id/theme
PATCH  /api/v1/organizations/:id/theme
DELETE /api/v1/organizations/:id/theme
POST   /api/v1/organizations/:id/logo

GET   /api/v1/users
POST  /api/v1/users
GET   /api/v1/users/:id
PATCH /api/v1/users/:id
PATCH /api/v1/users/:id/status
POST  /api/v1/users/bulk
POST  /api/v1/users/import

GET    /api/v1/groups
POST   /api/v1/groups
GET    /api/v1/groups/:id
PATCH  /api/v1/groups/:id
GET    /api/v1/groups/:id/members
POST   /api/v1/groups/:id/members
DELETE /api/v1/groups/:id/members/:userId
GET    /api/v1/groups/:id/managers
POST   /api/v1/groups/:id/managers
DELETE /api/v1/groups/:id/managers/:managerId

GET  /api/v1/memberships
POST /api/v1/memberships
GET  /api/v1/memberships/:id

GET    /api/v1/courses
POST   /api/v1/courses
GET    /api/v1/courses/:id
PATCH  /api/v1/courses/:id
PATCH  /api/v1/courses/:id/status
DELETE /api/v1/courses/:id
GET    /api/v1/courses/:id/completion
GET    /api/v1/courses/:id/instructors
POST   /api/v1/courses/:id/instructors
DELETE /api/v1/courses/:id/instructors/:instructorId

GET    /api/v1/courses/:courseId/lessons
POST   /api/v1/courses/:courseId/lessons
PATCH  /api/v1/courses/:courseId/lessons/order
GET    /api/v1/lessons/:id
PATCH  /api/v1/lessons/:id
PATCH  /api/v1/lessons/:id/status
DELETE /api/v1/lessons/:id

GET    /api/v1/courses/:courseId/materials
POST   /api/v1/courses/:courseId/materials
GET    /api/v1/materials/:id
PATCH  /api/v1/materials/:id
PATCH  /api/v1/materials/:id/status
GET    /api/v1/materials/:id/download
POST   /api/v1/materials/:id/file
DELETE /api/v1/materials/:id/file
POST   /api/v1/materials/:id/file/multipart
POST   /api/v1/materials/:id/file/multipart/:uploadId/complete
DELETE /api/v1/materials/:id/file/multipart/:uploadId
POST   /api/v1/materials/:id/result

GET   /api/v1/progress
GET   /api/v1/progress/summary
GET   /api/v1/progress/:id
POST  /api/v1/progress

GET   /api/v1/assignments
GET   /api/v1/assignments/:id
POST  /api/v1/assignments
PATCH /api/v1/assignments/:id/status

GET   /api/v1/assessments
GET   /api/v1/assessments/:id
POST  /api/v1/assessments
PATCH /api/v1/assessments/:id
PATCH /api/v1/assessments/:id/status

GET  /api/v1/assessments/:assessmentId/questions
GET  /api/v1/assessments/:assessmentId/quiz
POST /api/v1/assessments/:assessmentId/questions
GET  /api/v1/questions/:id
GET  /api/v1/questions/:questionId/options
POST /api/v1/questions/:questionId/options

GET  /api/v1/assessments/:assessmentId/attempts
POST /api/v1/assessments/:assessmentId/attempts
GET  /api/v1/assessments/:assessmentId/results
GET  /api/v1/assessments/:assessmentId/report
GET  /api/v1/attempts/:id
GET  /api/v1/attempts/:id/result

GET  /api/v1/certificates
POST /api/v1/certificates
GET  /api/v1/certificates/:id

GET  /api/v1/manager/team-summary
```

## Public endpoints

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/health`, `/health/live`, `/health/ready` | Service health/liveness/readiness smoke status. |
| GET | `/openapi` | Returns the manual OpenAPI document. |
| POST | `/auth/login` | Accepts email/password, sets access/refresh cookies (or returns tokens for API clients). |
| POST | `/auth/refresh` | Rotates the refresh token and issues a new access token. |
| POST | `/auth/password-reset/request` | Accepts password reset request input and returns generic accepted response. |
| POST | `/auth/password-reset/confirm` | Accepts reset token and new password candidate and returns generic accepted response. |
| POST | `/organizations/register` | First organization/admin registration flow. |

## Authenticated endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/auth/me` | Requires valid session. |
| POST | `/auth/logout` | Revokes the current session. |
| POST | `/auth/logout-all` | Revokes all sessions for the current user. |
| GET / POST | `/organizations`, `/organizations/:id` | Admin read/create scope. |
| GET / PATCH / DELETE | `/organizations/:id/theme` | Admin theme settings scope. |
| POST | `/organizations/:id/logo` | Admin logo upload scope; multipart `file`. |
| GET / POST / PATCH | `/users`, `/users/:id`, `/users/:id/status` | Admin/manager scope per `docs/API_RBAC_MATRIX.md`. |
| POST | `/users/bulk`, `/users/import` | Admin/manager bulk/import scope. |
| GET / POST | `/memberships`, `/memberships/:id` | Admin/manager scope. |
| GET / POST / PATCH | `/groups`, `/groups/:id` | Admin/manager scope. |
| GET / POST / DELETE | `/groups/:id/members`, `/groups/:id/managers` | Admin/manager group membership scope. |
| GET / POST / PATCH / DELETE | `/courses`, `/courses/:id`, `/courses/:id/status` | Admin/manager/instructor scope; write scope additionally checked by `CourseAccessGuard` for instructors. |
| GET | `/courses/:id/completion` | Completion by current user and organization context. |
| GET / POST / DELETE | `/courses/:id/instructors` | Admin/instructor-owner scope. |
| GET / POST / PATCH / DELETE | `/courses/:courseId/lessons`, `/lessons/:id` | Admin/manager/instructor read scope; instructor write scope via `CourseAccessGuard`. |
| GET / POST / PATCH / DELETE | `/courses/:courseId/materials`, `/materials/:id`, `/materials/:id/file[/multipart...]` | Admin/manager/instructor/learner read scope; instructor write scope via `CourseAccessGuard`. |
| GET | `/materials/:id/download` | Authorized read scope; returns a five-minute presigned URL for private objects. |
| POST | `/materials/:id/result` | Malware-scan callback for uploaded material files. |
| GET / POST | `/assignments`, `/assignments/:id` | Admin/manager/instructor/learner read scope; instructor/manager create scope. |
| PATCH | `/assignments/:id/status` | Admin/manager/instructor status scope. |
| GET / POST | `/progress`, `/progress/:id`, `/progress/summary` | Admin/manager/instructor/learner read/create scope. |
| GET / POST / PATCH | `/assessments`, `/assessments/:id`, `/assessments/:id/status` | Admin/manager/instructor/learner read scope; instructor create/update scope. |
| GET / POST | `/assessments/:assessmentId/questions`, `/questions/:id`, `/questions/:questionId/options` | Instructor/admin manage scope; learner read scope via `/assessments/:assessmentId/quiz`. |
| GET / POST | `/assessments/:assessmentId/attempts`, `/attempts/:id`, `/attempts/:id/result` | Admin/manager/instructor/learner scope. |
| GET | `/assessments/:assessmentId/results`, `/assessments/:assessmentId/report` | Admin/manager/instructor read scope. |
| GET / POST | `/certificates`, `/certificates/:id` | Admin/manager/instructor/learner read scope; admin/manager/instructor create scope. Certificates can also be auto-issued after passed assessment attempts. |
| GET | `/manager/team-summary` | Manager-only scope, scoped to the manager's assigned groups (`manager-team-scope`). |

## Contract change rules

- Public endpoint path or response changes require an explicit API contract update.
- New request bodies must use Zod runtime validation.
- Database-backed changes must use Prisma and must not use unsafe raw SQL.
- Prisma schema or migration changes require explicit approval before implementation.
- List endpoint pagination/filter/sort changes must follow the list query consistency plan above.
- Runtime response-shape changes must update backend tests and frontend API clients in the same PR.

## Related docs

- `docs/MVP_READINESS_DASHBOARD.md`
- `docs/API_RBAC_MATRIX.md`
- `docs/MVP_LOCAL_RUNBOOK.md`
- `docs/PILOT_CHECKLIST.md`
- `docs/AUTH_SESSION_STORE_DESIGN.md`
