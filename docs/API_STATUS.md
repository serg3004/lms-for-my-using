# API Status

Last synced: 2026-05-28  
Source branch: `fix/secure-public-user-organization-creation`

## Current status

Security hardening for public creation endpoints is in place for the current MVP baseline:

- Direct `POST /api/v1/users` now requires `AuthGuard`, `RolesGuard`, and `OrganizationScopeGuard`.
- Direct `POST /api/v1/users` is limited to `rolePolicies.usersCreate`.
- Direct `POST /api/v1/users` validates `body.organizationId` against the authenticated user's organization scope.
- Direct `POST /api/v1/organizations` now requires `AuthGuard` and `RolesGuard`.
- Direct `POST /api/v1/organizations` is limited to the new `rolePolicies.organizationsCreate` admin policy.
- Public `POST /api/v1/organizations/register` remains available as the explicit workspace registration flow.

## Current limitations

- No refresh token flow.
- No logout flow.
- No global state manager.
- No Prisma schema or migration changes.
- No CI/CD changes.
- No new dependencies.

## Endpoint map

```text
POST /api/v1/users                  protected
POST /api/v1/users/bulk             protected
POST /api/v1/users/import           protected
POST /api/v1/organizations          protected
POST /api/v1/organizations/register public registration flow
```
