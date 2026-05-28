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
| Courses read | yes | yes | yes | no |
| Courses create | yes | no | yes | no |
| Lessons read | yes | yes | yes | no |
| Lessons create | yes | no | yes | no |
| Course materials read | yes | yes | yes | no |
| Course materials create | yes | no | yes | no |
| Assignments read | yes | yes | yes | no |
| Assignments create | yes | yes | yes | no |
| Progress read | yes | yes | yes | no |
| Progress create | yes | yes | yes | no |
| Assessments read | yes | yes | yes | no |
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

## Guard model

Most protected API controllers use:

1. `AuthGuard` to require a bearer token.
2. `RolesGuard` to enforce role policies.
3. `OrganizationScopeGuard` on write operations where the request body contains `organizationId`.

Tenant isolation must be enforced by service queries using `organizationId` from the authenticated user or by `OrganizationScopeGuard` for scoped writes.

## Current limitations

- This document mirrors the current MVP policy map only.
- Learner-facing read policies are intentionally narrow until learner web flows are implemented.
- Any policy change must update this document and related tests.
