# API RBAC semantics

> **Status:** `CURRENT` human semantics / invariants.
>
> **Security authority:** role policies, guards/access decorators and scoped service policies in current code. This document does not maintain a hand-written role/policy/controller inventory.

## Current inventory

The readable current role/policy inventory is generated from owners in [`../generated/RBAC.md`](../generated/RBAC.md). Role existence is owned by Prisma/shared role definitions; permissions are owned by `apps/api/src/modules/auth/roles.ts` plus guards/access decorators.

Generated inventory is derived evidence, not a replacement authority.

## Access classification

Every HTTP handler must have an explicit access classification:

- public;
- authenticated;
- role-policy protected.

`RolesGuard` is fail-closed for role-protected handlers when required policy metadata is missing. Authentication-only endpoints enforce authenticated access without inventing a role permission.

## Role policy vs object scope

A role policy answers whether a role may call a class of operation. It does **not** automatically authorize every object instance.

Course-scoped authorization is enforced separately by `CourseAccessGuard` and its metadata/policies under `apps/api/src/modules/course-access/`. Instructor access to course-bound resources therefore depends on current ownership/scope data, not merely on possessing the instructor role.

Manager team/object scope is enforced by its dedicated query/policy layer. Frontend navigation visibility is never a security control.

Group mutations use separate role and object-scope checks. Administrators may create and update groups and change their manager set tenant-wide. Managers may only add or remove members of an active group that they already managed before the mutation starts; they cannot change any group's manager set. Every group, membership, manager relation, and target-user lookup remains constrained to the authenticated tenant. A denied mutation occurs before any write and therefore cannot expand the manager's downstream user, assignment, progress, or report scope.

Department and department-type mutations (tree CRUD, move/reparent, archive/restore) are admin-only role policies with no manager object scope yet; a manager-scope layer for departments, if introduced, will be a future documented change here. Reparenting a department is additionally guarded at the data layer: the move runs in a Serializable transaction with bounded retry on serialization failure, and rejects a move that would create a cycle or exceed the maximum tree depth before any write, so two concurrent conflicting moves can never both commit.

Department membership (create/close/transfer/bulk-transfer, and reading a department's current users or a user's full membership history) is likewise admin-only for now. Two data-layer invariants back the role check regardless of caller: a partial unique index allows at most one current (`effectiveTo IS NULL`) primary membership per user, and another allows at most one current membership per user/department pair, so a race between two concurrent transfers for the same user can never leave more than one current primary — the losing request gets a conflict, not a corrupted state. A transfer or bulk transfer additionally rejects assigning an inactive user or an archived department before any write.

Department manager (create/close a DIRECT or FUNCTIONAL manager assignment, switch a department's manager inheritance mode, and reading a department's effective manager set) is admin-only. A manager relation never grants the `manager` RBAC role by itself and does not require the user to hold a Department membership. Two data-layer invariants mirror the membership ones: a partial unique index allows at most one current manager per (department, user, type), and another allows at most one current primary manager per (department, type). Switching a department's `directManagerMode`/`functionalManagerMode` to `INHERIT` is rejected while current local managers of that type still exist, so a mode switch can never silently hide them; the caller must close them first.

Position (the tenant-scoped job-title catalog, and reading/creating/updating/archiving/restoring positions) is admin-only, mirroring the department-type role policy. `UNIQUE(organizationId, code)` rejects a duplicate code within the same tenant before any write. A Position is never hard-deleted, only archived: an archived Position remains valid on historical and existing Department memberships, but the membership create/transfer/bulk-transfer endpoints reject assigning an archived (or cross-tenant) Position to a new current relation. Legacy `User.position` is unaffected by this catalog for now.

PositionCourse (the position-to-course requirement catalog: create/update/archive/restore/read) is admin-only, mirroring the Position role policy. `UNIQUE(organizationId, positionId, courseId)` rejects a duplicate requirement row before any write, and never creates a Position or a Course as a side effect. Assignment creation (`assignmentsCreate`: admin/manager/instructor) now additionally accepts a `departmentId` target — the exact-one-of `userId`/`groupId`/`departmentId` rule is enforced both by a Zod refinement and, defense in depth, by a database CHECK constraint (`num_nonnulls(...) = 1`); no manager object-scope restriction is applied to a department target yet (deferred to PR 278's `OrganizationAccessScopeService`). Learner eligibility for recording progress on a course is decided by a single `LearningTargetResolverService`, which resolves every current source (direct assignment, group, department, position, self-enrollment) fresh on each check — removing one source never revokes access if another still grants it, and there is no separate stored "entitlement" state to fall out of sync.

`OrganizationAccessScopeService` (`apps/api/src/modules/organization-access-scope/`) is the central object-scope layer PR 278 introduces to close the department-target gap left open above: it unions the existing ManagerGroup scope with a manager's current, literal, **DIRECT**-type `DepartmentManager` rows (never `FUNCTIONAL`, which stays metadata-only and grants no data scope) plus every descendant department, deduped against the Group branch. `DepartmentManager` alone never grants the `manager` RBAC role — the role check and the object-scope check are independent, and both must hold. Effective users of a department scope are current (`effectiveTo IS NULL`) **primary** memberships only; an additional (non-primary) membership never extends scope. This service is a `Prisma.WhereInput` builder consumed by `ManagerService` (team summary, overdue reminders) and `ReportsService`, not a Nest guard — it runs downstream of, and stays fully separate from, the tenant-level `OrganizationScopeGuard` and role-level `RolesGuard`. `GET /reports/summary` now accepts optional `departmentId`/`includeDescendants` query parameters: without them, scope is exactly the pre-PR-278 Group-only behavior (unchanged); with them, the requested department's population (current primary memberships in that department, or its subtree when `includeDescendants=true`) is **intersected** with the caller's `OrganizationAccessScopeService` scope, so a manager requesting a sibling or foreign-tenant department resolves to an empty population rather than an error or a leak. `GET /reports/admin-dashboard` is unaffected (admin-only, tenant-wide, no manager scope was ever applied there). ReportingLine (PR 279) is a planned third union branch, not yet implemented.

ReportingLine (personal manager relations, `DIRECT`/`FUNCTIONAL`/`PROJECT`, separate from the Department tree) mutations (`POST /reporting-lines`, `PATCH /reporting-lines/:id`, `POST /reporting-lines/:id/close`) and reads (`GET /users/:id/reporting-lines`, `GET /users/:id/effective-manager`) are admin-only, mirroring DepartmentManager. `employeeId == managerId` is rejected both by a Zod refinement and, defense in depth, by a database CHECK constraint. Only `DIRECT` edges participate in cycle detection: creating a `DIRECT` line runs inside a Serializable transaction with bounded retry that rejects any edge which would close a cycle in the manager hierarchy (verified concurrency-safe: two racing creates that would together form a cycle can never both commit); `FUNCTIONAL`/`PROJECT` edges skip this check entirely, since they never chain into that graph. `GET /users/:id/effective-manager` resolves a fixed fallback chain: a current primary `DIRECT` ReportingLine wins; otherwise the employee's current primary Department's effective primary `DIRECT` manager (same LOCAL/INHERIT/MERGE computation as `department-managers`); otherwise `null`. `OrganizationAccessScopeService` (PR 278) gains a third union branch here: direct and transitive `DIRECT` reports of the actor (a manager managing a manager managing an IC sees the whole chain), gated on the same `RBAC role = manager` requirement as the Group and Department branches, deduped against them, and never extended by a `FUNCTIONAL`/`PROJECT` relation or by a DepartmentManager/ReportingLine row that only exists in another tenant.

For instructor ownership semantics see [`INSTRUCTOR_COURSE_OWNERSHIP.md`](./INSTRUCTOR_COURSE_OWNERSHIP.md).

## Mentor / curator / instructor terminology

The technical `mentor` role is distinct from `instructor`; legacy `curator` wording must not be interpreted as a second current technical role without owner evidence. See [`GLOSSARY.md`](./GLOSSARY.md) and [`../architecture/adr/ADR_CURATOR_ROLE.md`](../architecture/adr/ADR_CURATOR_ROLE.md).

The exact current permissions for any role must be read from the policy owner or generated RBAC view, not inferred from prose labels.

## Enforcement

Current API tests enforce policy completeness and positive/negative decisions. Relevant owners include:

- `apps/api/src/modules/auth/roles.ts`;
- `apps/api/src/modules/auth/roles.spec.ts`;
- API policy audit tests;
- object-scope guard/policy tests.

A new handler without access classification, a changed role policy, or changed scope semantics must update the owning tests. Human documentation should describe durable semantics; volatile membership tables belong to deterministic generation.

## Change rules

When authorization changes:

1. update the canonical code owner;
2. add/adjust allowed and forbidden tests;
3. regenerate/check derived RBAC docs;
4. review human contract semantics here if behavior changed;
5. verify frontend visibility only as UX consistency, not as enforcement evidence.
