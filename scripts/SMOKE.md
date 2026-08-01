# Staging smoke check

Use `scripts/smoke-staging.sh` to verify the deployed API, Web application,
security headers, cookie authentication, role workspaces, RBAC, and object scope.

## Dedicated staging fixtures

Create four active smoke users in one staging organization: one each with only
the `admin`, `manager`, `instructor`, and `learner` role. Also keep these stable,
read-only scope fixtures:

- a user in the same organization but outside every team assigned to the smoke manager;
- a course in the same organization that is not assigned to the smoke instructor;
- a user in a different organization.

The script never creates, edits, or deletes business data. Do not use production
accounts or fixtures.

## Required environment variables

`API_URL` and `WEB_URL` are GitHub Environment variables. All values prefixed
with `STAGING_SMOKE_`, including fixture IDs, must be encrypted CI secrets.

```bash
export API_URL="https://api.example.com"
export WEB_URL="https://app.example.com"
export STAGING_SMOKE_ORGANIZATION="smoke-tenant"
export STAGING_SMOKE_ADMIN_EMAIL="admin-smoke@example.com"
export STAGING_SMOKE_ADMIN_PASSWORD="<secret>"
export STAGING_SMOKE_MANAGER_EMAIL="manager-smoke@example.com"
export STAGING_SMOKE_MANAGER_PASSWORD="<secret>"
export STAGING_SMOKE_INSTRUCTOR_EMAIL="instructor-smoke@example.com"
export STAGING_SMOKE_INSTRUCTOR_PASSWORD="<secret>"
export STAGING_SMOKE_LEARNER_EMAIL="learner-smoke@example.com"
export STAGING_SMOKE_LEARNER_PASSWORD="<secret>"
export STAGING_SMOKE_OUT_OF_TEAM_USER_ID="<uuid>"
export STAGING_SMOKE_UNASSIGNED_COURSE_ID="<uuid>"
export STAGING_SMOKE_FOREIGN_USER_ID="<uuid>"
```

Never commit these values or pass them as command-line arguments.

## Run

```bash
bash scripts/smoke-staging.sh
```

In addition to health, HTTPS redirect, HSTS, CSP, and frame-protection checks,
the role matrix is:

| Role | Workspace | Read flow | Negative/scope assertions |
| --- | --- | --- | --- |
| admin | `/admin` | users | cross-organization user is `404` |
| manager | `/manager/dashboard` | team-scoped users | out-of-team user is `404`; course creation is `403` |
| instructor | `/instructor/dashboard` | assigned courses | unassigned course is `404`; users API is `403` |
| learner | `/learn` | available courses | users API is `403` |

Every account is checked through `/auth/me` for its expected role and logged out
with its CSRF token. A status mismatch returns non-zero. Response bodies and
tokens are never printed, and the temporary directory containing all cookie jars
and request bodies is removed by an exit trap on success, failure, or interruption.

Both public URLs must use `https://`; these checks target staging ingress where
TLS termination and application routing are configured.

## Optional environment variables

```bash
export HEALTH_PATH="/api/v1/health/ready"
export CURL_TIMEOUT_SECONDS="15"
```
