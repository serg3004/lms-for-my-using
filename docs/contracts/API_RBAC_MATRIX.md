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
