# API Contracts

> **Статус:** `CURRENT` human semantics / invariants.
>
> **API surface authority:** runtime OpenAPI + controllers. This file MUST NOT be treated as a complete route inventory.
>
> **Reconciled against `main`:** `cbeecd860717c2b8df9c821c1cd7bad323ad3b0e` (2026-08-26).

## Current API authority

- Base path: `/api/v1`.
- Runtime OpenAPI JSON: `/api/v1/api-json`.
- Swagger UI: `/api/v1/docs`.
- Legacy `/api/v1/openapi` is deprecated and is not the current authority.
- Controller metadata + runtime OpenAPI define the current HTTP surface. Manual route lists are intentionally not duplicated here.

For a concrete endpoint, verify runtime OpenAPI/controller metadata at the current SHA.

## Current implementation baseline

Confirmed on the reconciled snapshot:

- auth login, refresh, logout, logout-all, current user and password reset request/confirm;
- organizations, users, memberships and groups;
- courses/lessons/materials, including `GET /courses/summary`;
- assignments/submissions, progress, assessments/questions/options/attempts/results/report;
- certificates, manager flows and theme settings;
- Notifications API/module;
- Admin Audit Log API/module;
- runtime environment validation and centralized API error handling.

These bullets are navigation only, not a generated inventory.

## Authentication/session semantics

- Access token is a JWT and may be supplied through supported cookie/bearer flows.
- Refresh tokens are backed by server-side `Session` state and rotate.
- `POST /auth/logout` revokes the current session; `POST /auth/logout-all` revokes all sessions for the current user.
- Password-reset request/confirm is implemented; delivery/provider availability is a separate live/config concern.

Old docs describing logout as purely stateless or password reset as an intentional `503` are historical and do not override current auth code.

## Tenant and authorization semantics

- Authenticated requests operate within current organization context.
- Role policies are owned by `apps/api/src/modules/auth/roles.ts`; object-level guards/access rules are additional enforcement.
- The current role set is owned by Prisma/shared role types, not duplicated in this file.
- Detailed human RBAC semantics are in `docs/API_RBAC_MATRIX.md`; code/guards remain authoritative for current enforcement.

## Error contract

Canonical API errors use the shared API response/error layer. Current stable code/type definitions are authoritative for fields and codes.

A representative shape is:

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

Do not add a field such as `requestId` to docs unless current shared/runtime contract contains it.

## List-query evolution

Pagination/filter/sort behavior is endpoint-specific until current code proves a shared runtime response contract. Existing unpaginated response shapes MUST NOT change silently.

When changing a list endpoint:

- use runtime validation;
- keep queries organization-scoped;
- allowlist sortable/filterable fields;
- update backend tests, runtime OpenAPI and affected frontend client in the same PR;
- update this document only for human semantics/invariants, not by maintaining another full endpoint inventory.

## Notifications and Audit Log

Old claim: “No dedicated audit-log or notifications module.”

**Reconciled status:** stale. Current repository contains both `NotificationsModule` and `AuditLogModule`, corresponding Prisma models and UI/API surfaces.

Whether either capability is required for MVP is a product/scope decision in `MVP_SCOPE_LOCK.md` / `TODO_VERIFY.md`; that is separate from implementation existence.

## Live/deployment statements

Production Redis/provider/deployment/protection status MUST be treated as live evidence, not API contract. Dated evidence may explain what was observed at a SHA/environment but does not become a permanent current claim here.

## Contract change rules

- Public path/request/response changes require runtime OpenAPI/tests/client/docs review in the same PR.
- New request bodies use the repository's current runtime validation approach.
- Database-backed contract changes follow Prisma/migration compatibility rules.
- Authorization changes update relevant policy/guard tests and human RBAC semantics.
- Do not manually copy the complete runtime route surface into this document.

## Related docs

- `docs/README.md`
- `docs/API_RBAC_MATRIX.md`
- `docs/MVP_SCOPE_LOCK.md`
- `docs/MVP_READINESS_DASHBOARD.md`
- `docs/AUTH_SESSION_STORE_DESIGN.md`
