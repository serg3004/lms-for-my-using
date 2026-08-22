# PR 153 security audit

This document records the public API surface reviewed for PR 153. The inventory is based on
controllers explicitly marked with `@PublicAccess()` plus operational endpoints that perform
their own authentication. All paths are below `/api/v1`.

## Public endpoint inventory

| Method | Path | Input validation / access control | CSRF assessment |
| --- | --- | --- | --- |
| GET | `/health`, `/health/live`, `/health/ready` | No caller input; readiness errors expose dependency status only | Safe method |
| GET | `/openapi` | No caller input | Safe method |
| POST | `/auth/login` | `loginSchema` validates and bounds organization, email, and password | No ambient authority exists before login |
| POST | `/auth/refresh` | Requires the path-scoped, `HttpOnly`, `SameSite=Lax` refresh cookie; tokens are single-use and rotated | Cross-site unsafe requests do not receive a Lax cookie; the endpoint does not accept bearer/body refresh tokens |
| POST | `/auth/password-reset/request` | `passwordResetRequestSchema`; response is deliberately non-enumerating | No authenticated ambient authority; operation is rate limited |
| POST | `/auth/password-reset/confirm` | `passwordResetConfirmSchema`; reset token is an explicit capability | No authenticated ambient authority; operation is rate limited |
| POST | `/organizations/register` | `registerOrganizationSchema` validates all nested organization/admin fields | No authenticated ambient authority; operation is rate limited |
| POST | `/internal/material-scans/:id/result` | Constant-time bearer-secret verification precedes `verdictSchema` validation | Non-browser service callback authenticated by an explicit bearer secret |

`GET /metrics` is an operational endpoint rather than an application-public endpoint. In
production it must be configured with `METRICS_BEARER_TOKEN`; the controller compares that
bearer token in constant time. Deployment must not expose an unconfigured metrics endpoint to
an untrusted network.

All remaining application controllers use `AuthGuard` and role/scope guards. Authenticated
unsafe requests made with the access-token cookie additionally require the double-submit
`X-CSRF-Token` header. Bearer-authenticated API clients do not need CSRF protection because a
browser does not attach bearer credentials automatically.

## Error and CORS findings

- `ApiExceptionFilter` maps Zod failures to HTTP 400 with a stable `VALIDATION_ERROR` payload.
- Unexpected exceptions return a generic HTTP 500 payload. Prisma errors are normalized and
  raw SQL, stack traces, filesystem paths, and exception messages are not returned.
- CORS uses the single `FRONTEND_URL` value and credentials mode. It neither reflects an
  arbitrary request origin nor uses `*`.
- The integration security audit exercises every body-bearing public endpoint with an invalid
  body, verifies CORS allow/block behavior, and checks representative 400 and 500 responses for
  sensitive implementation details.

## Deployment requirements

1. Set `FRONTEND_URL` to the exact deployed web origin (scheme, host, and port where applicable).
2. Set a strong `MALWARE_SCANNER_CALLBACK_SECRET` when the scanner callback is enabled.
3. Set `METRICS_BEARER_TOKEN`, or keep `/metrics` reachable only on a trusted internal network.
4. Keep the existing sensitive-route rate limiter enabled and use Redis in multi-instance production.
