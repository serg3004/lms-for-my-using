# API Response Types Shared Gaps

Document status: docs-only  
Scope: PR 69 docs/architecture/product gaps for moving selected API response types to shared.

## Current baseline

PR 69 in `docs/DEVELOPMENT_PLAN.md` is defined as:

- move selected api response types to shared;
- move 1-2 simple API response types to shared;
- update frontend/backend imports.

The repository already has a shared package:


```text
packages/shared
```

The current shared API type file is:

```text
packages/shared/src/types/api.ts
```

It already exports:

- `ApiErrorDetail`
- `ApiError`
- `ApiErrorResponse`
- `PaginatedResponse<T>`

## Product/architecture gap

The remaining gap is not only moving types. The project needs a safe rule for when an API response type belongs in `packages/shared` and when it should stay local to a Web API domain wrapper or API module.

Without that rule, future PRs can accidentally:

- move unstable domain-specific shapes into shared too early;
- create shared types that duplicate backend DTOs without tests;
- change frontend imports without synchronizing backend contracts;
- treat docs-only contract notes as runtime implementation.

## Shared type candidate rule

A response type is a good candidate for `packages/shared` when all conditions are true:

1. It is used by both API and Web, or it is a cross-cutting API client contract.
2. It is not tied to a single page or one-off frontend state.
3. It does not expose Prisma model internals directly.
4. Its runtime response shape is already documented in API contracts or covered by tests.
5. Moving it does not silently change endpoint response shape.

Good current candidates:

| Type | Status | Notes |
|---|---|---|
| `ApiErrorResponse` | already shared | Cross-cutting error contract. |
|`PaginatedResponse<T>` | already shared | Cross-cutting collection response shape. |

Poor candidates for immediate shared movement:

|Candidate | Reason |
|---|---|
| Page-specific view models | Web-only state should stay near the page/domain wrapper. |
| Backend service DDOs backed by Prisma models | Can leak persistence details into frontend contracts. |
| Unverified domain responses | Need endpoint tests/docs sync before promotion. |

## Recommended follow-up implementation path

1. Audit imports for `ApiErrorResponse` and `PaginatedResponse<T>`.
2. Replace duplicate local definitions only where the runtime response shape is already stable.
3. Keep domain-specific response types in domain API wrappers until at least two consumers need them.
4. For each moved type, update tests or typecheck coverage in the same PR.
5. Do not change endpoint response shapes as part of a type-only move.

## Non-goals

This PR does not:

- move runtime code;
- change API response shapes;
- change imports;
- change Prisma schema or migrations;
- add dependencies;
- modify CI/CD;
- introduce a new shared package structure.

## Readiness checklist for a future code PR

- [ ] Target response types are listed before implementation.
- [ ] Existing duplicate definitions are identified.
- [ ] Backend/frontend imports are updated in one logical PR.
- [ ] Typecheck passes for affected packages.
- [ ] Runtime API behavior is unchanged.
- [ ] API docs are updated only if the actual response contract changes.
