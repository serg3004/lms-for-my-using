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
- The API policy audit test compares an explicit controller inventory with every production `*.controller.ts` file
  and requires exactly one access classification on every HTTP handler. A new controller or endpoint without a
  policy therefore fails the API test job in CI.
- The audit executes `RolesGuard` for every role on every role-protected controller method, covering both allowed
  and denied decisions across the entire API rather than only selected modules.
- The role-policy tests independently compare every centralized policy with the documented four-role matrix, so
  an undocumented policy or a role mismatch fails CI.
