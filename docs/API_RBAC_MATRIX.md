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
| Theme settings — read | ✓ | ✓ | ✓ | ✓ |
| Theme settings — write | ✓ |  |  |  |
| Manager team summary — read | ✓ | ✓ |  |  |

## Object-level scope (`CourseAccessGuard`)

Role policies above answer "can this role call this endpoint at all" — a separate, second guard answers "can
*this specific user* touch *this specific course*". `CourseAccessGuard` (`apps/api/src/modules/course-access/`)
is wired via `@UseGuards(AuthGuard, RolesGuard, CourseAccessGuard)` alongside the role guards on 8 controllers:
`courses`, `lessons`, `course-materials`, `assessments`, `assessment-questions`, `assessment-attempts`,
`assignments`, `progress`, `certificates`.

- For a user whose only roles are course-scoped (currently: `instructor`), the guard resolves the course a
  request touches (via `@CourseScope(...)` metadata on the handler) and rejects it unless that course — or the
  course a nested resource like a lesson/assessment belongs to — is one the instructor is assigned to.
- `admin` (including a user who also holds `instructor`) bypasses course scoping and keeps organization-wide
  access.
- `manager` and `learner` scoping is governed by their own dedicated policies, not this guard.
- Full mechanics, including how a newly created course is auto-assigned to its creator and how unassigned
  resources 404 instead of 403 (to avoid disclosing existence): `docs/INSTRUCTOR_COURSE_OWNERSHIP.md`.

Manager team scope (which learners/groups a manager can see) is implemented separately again, at the service
query level rather than as a shared guard.

## Enforcement

- `RolesGuard` rejects an endpoint when its role-policy metadata is absent.
- The API policy audit test compares an explicit controller inventory with every production `*.controller.ts` file
  and requires exactly one access classification on every HTTP handler. A new controller or endpoint without a
  policy therefore fails the API test job in CI.
- The audit executes `RolesGuard` for every role on every role-protected controller method, covering both allowed
  and denied decisions across the entire API rather than only selected modules.
- `roles.spec.ts` behaviourally checks a fixed, hand-maintained list of policies against expected roles — **not**
  every key of `rolePolicies`. A newly added policy (like `themeSettingsRead` or `managerTeamSummaryRead` were,
  until this doc was updated) will not fail that test or this document by omission; both need a manual update
  whenever `rolePolicies` changes. Treat `apps/api/src/modules/auth/roles.ts` as the only thing CI actually
  guarantees is current — this document and the spec's role list are best-effort mirrors of it.
