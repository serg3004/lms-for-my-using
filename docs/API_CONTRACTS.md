# API Contracts

This document captures the current MVP API contract baseline. Runtime source of truth remains the controllers, schemas, and services under `apps/api/src`.

## Common conventions

Base path:

```text
/api/v1
```

Authentication:

```text
Authorization: Bearer <accessToken>
```

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

Current MVP list endpoints mostly return organization-scoped arrays without a shared pagination/filter/sort query contract. Before changing runtime behavior, use this plan as the implementation contract for the next API consistency pass.

Target query parameters for collection endpoints:

| Parameter | Type | Default | Limit | Notes |
| --- | --- | --- | --- | --- |
| `page` | positive integer | `1` | min `1` | One-based page number. |
| `pageSize` | positive integer | `20` | max `100` | Requests above max should fail validation or clamp only if explicitly documented. |
| `sortBy` | string enum | endpoint-specific | allowlist only | Never pass arbitrary client field names directly into Prisma. |
| `sortDirection` | `asc` / `desc` | `asc` | enum only | Applies only with a valid `sortBy`. |
| `search` | string | none | trim, bounded length | Optional text search where the endpoint has safe searchable fields. |
| endpoint filters | typed query params | none | schema-defined | Examples: `status`, `courseId`, `lessonId`, `userId`, `groupId`. |

Target paginated response shape:

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

1. Add shared backend query schema helpers and shared response DTO type.
2. Migrate low-risk admin lists: users, groups, memberships.
3. Migrate learning content lists: courses, lessons, materials.
4. Migrate learner-facing lists: assignments, progress, assessments, certificates.
5. Sync manual OpenAPI and frontend domain modules after each endpoint batch.

## Public endpoints

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/health` | Returns service health smoke status. |
| GET | `/openapi` | Returns the static OpenAPI skeleton. |
| POST | `/auth/login` | Accepts email/password and returns an access token skeleton response. |
| POST | `/auth/password-reset/request` | Accepts password reset request input and returns generic accepted response. |
| POST | `/auth/password-reset/confirm` | Accepts reset token and new password candidate and returns generic accepted response. |

## Authenticated endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/auth/me` | Requires bearer token. |
| GET | `/organizations` | Admin read scope. |
| POST | `/organizations` | Admin create scope. |
| POST | `/organizations/register` | First organization/admin registration flow. |
| GET | `/users` | Admin/manager read scope. |
| POST | `/users` | Admin/manager create scope. |
| POST | `/users/bulk` | Admin/manager bulk create scope. |
| POST | `/users/import` | Import skeleton. |
| GET | `/memberships` | Admin/manager read scope. |
| POST | `/memberships` | Admin create scope. |
| GET | `/groups` | Admin/manager read scope. |
| POST | `/groups` | Admin/manager create scope. |
| GET | `/courses` | Admin/manager/instructor read scope. |
| GET | `/courses/:id` | Admin/manager/instructor read scope. |
| GET | `/courses/:id/completion` | Completion by current user and organization context. |
| POST | `/courses` | Admin/instructor create scope with organization scope check. |
| GET | `/courses/:courseId/lessons` | Admin/manager/instructor read scope. |
| POST | `/courses/:courseId/lessons` | Admin/instructor create scope. |
| GET | `/courses/:courseId/materials` | Admin/manager/instructor/learner read scope. |
| POST | `/courses/:courseId/materials` | Admin/instructor create scope. |
| GET | `/materials/:id` | Admin/manager/instructor/learner read scope. |
| GET | `/assignments` | Admin/manager/instructor/learner read scope. |
| GET | `/assignments/:id` | Admin/manager/instructor/learner read scope. |
| POST | `/assignments` | Admin/manager/instructor create scope. |
| GET | `/progress` | Admin/manager/instructor/learner read scope. |
| POST | `/progress` | Admin/manager/instructor/learner create scope. |
| GET | `/assessments` | Admin/manager/instructor/learner read scope. |
| GET | `/assessments/:id` | Admin/manager/instructor/learner read scope. |
| POST | `/assessments` | Admin/instructor create scope. |
| POST | `/assessments/:assessmentId/attempts` | Admin/manager/instructor/learner create scope. |
| GET | `/certificates` | Admin/manager/instructor/learner read scope. |
| GET | `/certificates/:id` | Admin/manager/instructor/learner read scope. |
| POST | `/certificates` | Admin/manager/instructor create scope. Certificates can also be auto-issued after passed assessment attempts. |

## Contract change rules

- Public endpoint path or response changes require an explicit API contract update.
- New request bodies must use Zod runtime validation.
- Database-backed changes must use Prisma and must not use unsafe raw SQL.
- Prisma schema or migration changes require explicit approval before implementation.
- List endpoint pagination/filter/sort changes must follow the list query consistency plan above.
- Runtime response-shape changes must update backend tests and frontend API clients in the same PR.
