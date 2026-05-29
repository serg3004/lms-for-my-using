# API Status

Last synced: 2026-05-29  
Source branch: `fix/workspace-registration-login-logout-hardening`

## Current status

Workspace registration and auth session handling are hardened for the current MVP baseline:

- `POST /api/v1/organizations/register` remains the explicit public workspace registration flow.
- Direct `POST /api/v1/users` and `POST /api/v1/organizations` remain protected by auth/RBAC.
- `POST /api/v1/auth/login` validates organization, active user status, and password before issuing a bearer token.
- `GET /api/v1/auth/me` validates bearer token and active user status.
- `POST /api/v1/auth/logout` validates bearer token and active user status before returning a stateless logout acknowledgement.
- The web logout helper always clears the stored access token in `finally`, even if the API request fails.

## Current limitations

- No refresh token flow.
- No server-side token revocation list.
- No Prisma schema or migration changes.
- No CI/CD changes.
- No new dependencies.

## Endpoint map

```text
POST /api/v1/organizations/register  public workspace registration flow
POST /api/v1/auth/login               public login
POST /api/v1/auth/logout              protected stateless logout acknowledgement
GET  /api/v1/auth/me                  protected current user
```
