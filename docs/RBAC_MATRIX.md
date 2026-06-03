# RBAC Matrix

Source of truth: `apps/api/src/modules/auth/roles.ts`.

## Roles

| Role | Purpose |
| --- | --- |
| `admin` | Organization administration and full MVP management scope. |
| `manager` | Operational management for users, groups, assignments, progress, and reporting. |
| `instructor` | Course, lesson, material, assessment, assignment, and learner progress workflows. |
| `learner` | Learner-facing attempts, results, certificates, and assigned learning flow. |

## Policy matrix

| Capability | admin | manager | instructor | learner |
| --- | --- | --- | --- | --- |
| Organizations read | yes | no | no | no |
| Users read | yes | yes | no | no |
| Users create | yes | yes | no | no |
| Memberships read | yes | yes | no | no |
| Memberships create | yes | no | no | no |
| Groups read | yes | yes | no | no |
| Groups create | yes | yes | no | no |
| Courses read | yes | yes | yes | yes |
| Courses create | yes | no | yes | no |
| Lessons read | yes | yes | yes | yes |
| Lessons create | yes | no | yes | no |
| Course materials read | yes | yes | yes | yes |
| Course materials create | yes | no | yes | no |
| Assignments read | yes | yes | yes | yes |
| Assignments create | yes | yes | yes | no |
| Progress read | yes | yes | yes | yes |
| Progress create | yes | yes | yes | yes |
| Assessments read | yes | yes | yes | yes |
| Assessments create | yes | no | yes | no |
| Assessment questions read | yes | yes | yes | no |
| Assessment questions create | yes | no | yes | no |
| Assessment answer options read | yes | yes | yes | no |
| Assessment answer options create | yes | no | yes | no |
| Assessment attempts read | yes | yes | yes | no |
| Assessment attempts create | yes | yes | yes | yes |
| Assessment attempt results read | yes | yes | yes | yes |
| Certificates read | yes | yes | yes | yes |
| Certificates create | yes | yes | yes | yes |

## Learner MVP access

Learners can read the resources used by the learner web routes:

- courses and course details;
- lessons and lesson details;
- course materials;
- assignments;
- progress;
- assessments;
- assessment attempt results;
- certificates.

Learners can also create progress records for lesson completion and create assessment attempts. Learners still cannot create admin-authored content such as courses, lessons, materials, assignments, assessments, questions, or answer options.

## Admin/instructor/manager MVP access

The current admin web surface is broader than a single `admin` role:

- `admin`, `manager`, and `instructor` can see the `/admin` navigation entry in the web app.
- API authorization remains role-policy based and is the source of truth.
- `manager` can manage users, groups, assignments, progress/reporting-oriented reads, attempts, results, and certificates, but cannot create courses, lessons, materials, assessments, questions, or answer options.
- `instructor` can create learning content and assessments, and can read operational progress/result surfaces, but cannot manage users, memberships, or groups.
- `admin` retains full MVP management scope.

## Guard model

Most protected API controllers use:

1. `AuthGuard` to require an access token.
2. `RolesGuard` to enforce role policies from `rolePolicies`.
3. `OrganizationScopeGuard` on write operations where the request body contains `organizationId`.

Tenant isolation must be enforced by service queries using `organizationId` from the authenticated user or by `OrganizationScopeGuard` for scoped writes.

## Audit status

Last audit: 2026-06-03.

Checked surfaces:

- API source of truth: `apps/api/src/modules/auth/roles.ts`
- API enforcement: `AuthGuard`, `RolesGuard`, `OrganizationScopeGuard`
- Representative learner/admin controllers: courses, lessons, assignments, progress, materials, assessments, assessment attempts, certificates, users, groups, memberships
- Web route/navigation surface: `apps/web/src/app/App.tsx`

Findings:

- The documented policy matrix matches the current `rolePolicies` export.
- Learner-facing read/create permissions required by current learner pages are intentionally allowed.
- Learner admin-authored content creation remains denied by `rolePolicies`.
- Write endpoints with body `organizationId` use `OrganizationScopeGuard` in the checked controller set.
- Web navigation hides `/admin` for pure learner users, but frontend routing is not the authorization boundary.
- API role checks remain the source of truth for protected operations.

Regression coverage:

- `apps/api/src/modules/auth/roles.spec.ts` checks learner read/create expectations.
- `apps/api/src/modules/auth/roles.spec.ts` now checks the full audited matrix against `rolePolicies`.

## Current limitations

- This document mirrors the current MVP policy map only.
- Learner access is role-level and organization-scoped; fine-grained assignment/enrollment ownership checks remain service-level follow-up work.
- Admin web route visibility is navigation-level only; backend RBAC remains authoritative.
- Any policy change must update this document and related tests.
