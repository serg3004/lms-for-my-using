# Password reset status

Password reset is implemented. Both canonical endpoints and the PR 136 compatibility aliases are public:

- `POST /auth/password-reset/request` (`/auth/reset-password-request`);
- `POST /auth/password-reset/confirm` (`/auth/reset-password`).

The request body contains `organizationId` and normalized `email`. Known and unknown accounts receive the same `{ "accepted": true }` response. For an active account the API invalidates earlier unused reset tokens, creates 32 random bytes, stores only its SHA-256 digest, and sets a one-hour expiry.

Delivery is provider-neutral. `PASSWORD_RESET_DELIVERY_URL` identifies an HTTPS webhook that receives the email, organization, raw one-time token, and expiry; `PASSWORD_RESET_DELIVERY_TOKEN` optionally authenticates that request. The raw token is never persisted or logged. Without a configured delivery URL the public response remains generic but no message is delivered.

Confirmation requires the token and a Zod-validated strong password. The transaction conditionally marks a live unused token as used, replaces the scrypt password hash, and revokes all active sessions for that user. Unknown, expired, and already-used tokens return HTTP 400.

Operational requirements:

- protect both endpoints with the existing auth rate-limit policy;
- configure the delivery webhook and secret outside source control;
- make the delivery provider construct the public reset link and avoid logging its token;
- monitor webhook failures without exposing them to the requester;
- periodically delete expired token rows under the normal retention process.
