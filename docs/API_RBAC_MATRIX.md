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

| Resource/action | Admin | Manager | Instructor | Mentor | Learner |
| --- | :---: | :---: | :---: | :---: | :---: |
| Organizations — read/create | ✓ |  |  |  |  |
| Users — read/create | ✓ | ✓ |  |  |  |
| Memberships — read | ✓ | ✓ |  |  |  |
| Memberships — create | ✓ |  |  |  |  |
| Groups — read/create | ✓ | ✓ |  |  |  |
| Courses — read | ✓ | ✓ | ✓ |  | ✓ |
| Courses — create/update/delete | ✓ |  | ✓ |  |  |
| Lessons — read | ✓ | ✓ | ✓ |  | ✓ |
| Lessons — read all (admin listing, `lessonsReadAll`) | ✓ |  |  |  |  |
| Lessons — create/update/delete | ✓ |  | ✓ |  |  |
| Course materials — read | ✓ | ✓ | ✓ |  | ✓ |
| Course materials/upload — create/update/delete/reassign to lesson | ✓ |  | ✓ |  |  |
| Assignments — read | ✓ | ✓ | ✓ |  | ✓ |
| Assignments — create/update (learner: нет self-enrollment, см. §13 `ENTITY_TECHSPEC_IMPLEMENTED.md`) | ✓ | ✓ | ✓ |  |  |
| Progress — read/create | ✓ | ✓ | ✓ |  | ✓ |
| Assessments — read | ✓ | ✓ | ✓ |  | ✓ |
| Assessments — create/update/delete | ✓ |  | ✓ |  |  |
| Assessment questions/options — read | ✓ | ✓ | ✓ |  |  |
| Assessment questions/options — create | ✓ |  | ✓ |  |  |
| Assessment attempts — read | ✓ | ✓ | ✓ |  |  |
| Assessment attempt results — read | ✓ | ✓ | ✓ |  | ✓ |
| Assessment attempts — create | ✓ | ✓ | ✓ |  | ✓ |
| Certificates — read | ✓ | ✓ | ✓ |  | ✓ |
| Certificates — create | ✓ | ✓ | ✓ |  |  |
| Theme settings — read | ✓ | ✓ | ✓ |  | ✓ |
| Theme settings — write | ✓ |  |  |  |  |
| Manager team summary — read | ✓ | ✓ |  |  |  |
| Checklists — read/create | ✓ | ✓* | ✓ |  |  |
| Checklist instances — read | ✓ | ✓ | ✓ | ✓ | ✓ |
| Checklist instances — create (assign) | ✓ | ✓ | ✓ |  |  |
| Checklist item results — write (submit answer/photo) | ✓ | ✓ | ✓ |  | ✓ |
| Checklist review — write (approve/reject an item) | ✓ | ✓ | ✓ | ✓ |  |

\* Manager only has `checklistsRead`, not `checklistsCreate` — see `rolePolicies` in `apps/api/src/modules/auth/roles.ts`.

Mentor was added in PR 146 (`docs/ADR_CURATOR_ROLE.md`) scoped narrowly to the checklist review workflow — it
does not gain any of the course/lesson/assignment/assessment access instructor or manager have.

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
- `roles.spec.ts` checks an `expectedRolePolicies` map against expected roles for **every key** of `rolePolicies`,
  not a fixed hand-picked subset (fixed 2026-08-08, closing a drift that previously let `themeSettingsRead` and
  `managerTeamSummaryRead` go unchecked until this doc was manually updated). The map's type is
  `satisfies Record<PolicyName, readonly UserRole[]>` — note this is only an editor hint here, not a CI
  guarantee, since `apps/api/tsconfig.json` excludes `*.spec.ts` from the `typecheck` script. The actual
  enforcement is a runtime test asserting `Object.keys(expectedRolePolicies)` equals `Object.keys(rolePolicies)`
  exactly (verified by deleting an entry and confirming that test — not `tsc` — fails). This document is still a
  best-effort mirror — update it whenever `rolePolicies` changes — but the test itself can no longer silently
  omit a new policy.
