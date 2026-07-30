# API RBAC matrix

The API uses explicit, fail-closed access metadata on every controller method. Endpoints are classified as
`public`, `authenticated`, or protected by one of the role policies defined in
`apps/api/src/modules/auth/roles.ts`.

## Non-role endpoints

| Access | Endpoints |
| --- | --- |
| Public | health, OpenAPI, organization registration, login, refresh, password-reset request and confirmation |
| Authenticated | logout, logout-all, current user (`auth/me`) |

`Authenticated` auth endpoints validate their access token directly because they also support cookie and bearer
token flows. All other protected endpoints use `AuthGuard` and `RolesGuard`.

## Role policies

| Resource/action | Admin | Manager | Instructor | Learner |
| --- | :---: | :---: | :---: | :---: |
| Organizations — read/create | ✓ |  |  |  |
| Users — read/create | ✓ | ✓ |  |  |
| Memberships — read | ✓ | ✓ |  |  |
| Memberships — create | ✓ |  |  |  |
| Groups — read/create | ✓ | ✓ |  |  |
| Courses — read | ✓ | ✓ | ✓ | ✓ |
| Courses — create/update/delete | ✓ |  | ✓ |  |
| Lessons — read | ✓ | ✓ | ✓ | ✓ |
| Lessons — create/update/delete | ✓ |  | ✓ |  |
| Course materials — read | ✓ | ✓ | ✓ | ✓ |
| Course materials/upload — create/update | ✓ |  | ✓ |  |
| Assignments — read | ✓ | ✓ | ✓ | ✓ |
| Assignments — create/update | ✓ | ✓ | ✓ |  |
| Progress — read/create | ✓ | ✓ | ✓ | ✓ |
| Assessments — read | ✓ | ✓ | ✓ | ✓ |
| Assessments — create/update | ✓ |  | ✓ |  |
| Assessment questions/options — read | ✓ | ✓ | ✓ |  |
| Assessment questions/options — create | ✓ |  | ✓ |  |
| Assessment attempts — read | ✓ | ✓ | ✓ |  |
| Assessment attempt results — read | ✓ | ✓ | ✓ | ✓ |
| Assessment attempts — create | ✓ | ✓ | ✓ | ✓ |
| Certificates — read | ✓ | ✓ | ✓ | ✓ |
| Certificates — create | ✓ | ✓ | ✓ |  |

Object-level ownership and team scope are intentionally outside this matrix. Course ownership and manager team
scope are implemented separately so that role authorization remains distinct from resource authorization.

## Enforcement

- `RolesGuard` rejects an endpoint when its role-policy metadata is absent.
- The API policy audit test inventories production controllers and requires exactly one access classification on
  every HTTP handler.
- The role-policy tests exercise both allowed and denied roles for every matrix entry.
