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
  "path": "/api/v1/example"
}
```

Zod validation errors return `400 Bad Request` with `VALIDATION_ERROR`.

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
| GET | `/assignments` | Admin/manager/instructor read scope. |
| POST | `/assignments` | Admin/manager/instructor create scope. |
| GET | `/progress` | Admin/manager/instructor read scope. |
| POST | `/progress` | Admin/manager/instructor create scope. |
| GET | `/assessments` | Admin/manager/instructor read scope. |
| POST | `/assessments` | Admin/instructor create scope. |
| GET | `/certificates` | Admin/manager/instructor/learner read scope. |
| POST | `/certificates` | Admin/manager/instructor/learner create scope. |

## Contract change rules

- Public endpoint path or response changes require an explicit API contract update.
- New request bodies must use Zod runtime validation.
- Database-backed changes must use Prisma and must not use unsafe raw SQL.
- Prisma schema or migration changes require explicit approval before implementation.
