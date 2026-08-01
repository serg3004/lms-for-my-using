# Staging smoke check

Use `scripts/smoke-staging.sh` to verify that the deployed API, Web application,
and the Web-to-API proxy path are reachable.

## Required environment variables

```bash
export API_URL="https://api.example.com"
export WEB_URL="https://app.example.com"
export STAGING_SMOKE_ORGANIZATION="smoke-tenant"
export STAGING_SMOKE_EMAIL="smoke@example.com"
export STAGING_SMOKE_PASSWORD="<secret>"
```

Use a dedicated active smoke user. Supply credentials from the CI environment's
encrypted secrets; never commit them or pass them as command-line arguments.

## Run

```bash
bash scripts/smoke-staging.sh
```

The script checks:

1. `${API_URL}/api/v1/health`
2. `${WEB_URL}`
3. `${WEB_URL}/api/v1/health`
4. HSTS and enforced CSP on all three HTTPS responses
5. CSP source restrictions, absence of `unsafe-eval`, and frame embedding protection
6. HTTP-to-HTTPS redirects for the API and Web URLs
7. Cookie login and authenticated `/auth/me`
8. Refresh-token rotation
9. Rejection of a cookie-authenticated mutation without a matching CSRF header
10. Logout with a matching CSRF header and rejection of the logged-out session

Any failed request returns a non-zero exit code.

The only mutation is logout, so the check does not modify persistent business
data. Response bodies are kept in a temporary file and never printed. The cookie
jar is deleted by an exit trap on success, request failure, or interruption.

Both `API_URL` and `WEB_URL` must use `https://`; header and redirect checks are
intended for a deployed staging environment where TLS terminates at the public
ingress.

## Optional environment variables

```bash
export HEALTH_PATH="/api/v1/health"
export CURL_TIMEOUT_SECONDS="15"
```
