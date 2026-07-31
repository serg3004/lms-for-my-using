# Staging smoke check

Use `scripts/smoke-staging.sh` to verify that the deployed API, Web application,
and the Web-to-API proxy path are reachable.

## Required environment variables

```bash
export API_URL="https://api.example.com"
export WEB_URL="https://app.example.com"
```

Do not commit real tokens or credentials.

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

Any failed request returns a non-zero exit code.

Both `API_URL` and `WEB_URL` must use `https://`; header and redirect checks are
intended for a deployed staging environment where TLS terminates at the public
ingress.

## Optional environment variables

```bash
export HEALTH_PATH="/api/v1/health"
export CURL_TIMEOUT_SECONDS="15"
export SMOKE_TOKEN="<temporary bearer token>"
```

`SMOKE_TOKEN` is only needed when the target environment protects a checked
endpoint. Pass it at runtime and never store it in the repository.
