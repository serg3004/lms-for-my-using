# Password reset status

Password reset is implemented. Both canonical endpoints and the PR 136 compatibility aliases are public:

- `POST /auth/password-reset/request` (`/auth/reset-password-request`);
- `POST /auth/password-reset/confirm` (`/auth/reset-password`).

The request body contains `organizationId` and normalized `email`. Known and unknown accounts receive the same `{ "accepted": true }` response. For an active account the API invalidates earlier unused reset tokens, creates 32 random bytes, stores only its SHA-256 digest, and sets a one-hour expiry.

Delivery is provider-neutral. `PASSWORD_RESET_DELIVERY_URL` identifies an HTTPS webhook that receives the email, organization, raw one-time token, and expiry; `PASSWORD_RESET_DELIVERY_TOKEN` optionally authenticates that request. The raw token is never persisted or logged. Without a configured delivery URL the public response remains generic but no message is delivered.

Confirmation requires the token and a Zod-validated strong password. The transaction conditionally marks a live unused token as used, replaces the scrypt password hash, and revokes all active sessions for that user. Unknown, expired, and already-used tokens return HTTP 400.

### Readiness and delivery failure observability

`PasswordResetDelivery.checkReadiness()` reports `ok` when `PASSWORD_RESET_DELIVERY_URL` is configured and `disabled` otherwise. An unconfigured provider is a valid, documented operational mode — not a failure — so it is not wired into `/health/ready`'s pass/fail contract; the method exists for callers (ops tooling, future health wiring) that need to distinguish "not configured" from "configured but failing" without duplicating the env var check.

Delivery failures are classified into one of three bounded reasons, exported as the `lms_password_reset_delivery_errors_total{reason}` Prometheus counter and logged as a safe warning (`Password reset delivery failed (<reason>)`, never the endpoint URL or the reset token):

- `http_error` — the delivery provider returned a non-2xx response;
- `timeout` — the 5-second request timeout (`AbortSignal.timeout`) fired;
- `network_error` — any other fetch failure (DNS, connection refused, TLS, etc.).

The public `/auth/password-reset/request` response is unaffected by any of this: delivery errors are always swallowed by `AuthService.requestPasswordReset()` after being classified and counted, preserving the anti-enumeration `{ accepted: true }` contract and its timing regardless of delivery outcome.

Operational requirements:

- protect both endpoints with the existing auth rate-limit policy;
- configure the delivery webhook and secret outside source control;
- make the delivery provider construct the public reset link and avoid logging its token;
- monitor `lms_password_reset_delivery_errors_total` for a sustained `http_error`/`timeout`/`network_error` rate rather than the requester-facing response, which never reflects delivery outcome;
- periodically delete expired token rows under the normal retention process.
