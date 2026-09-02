# Architecture and Module Boundaries

> **Status:** `CURRENT` decision/explanation.
>
> **Implementation authority:** current code/config. This document defines stable boundaries and extension rules; it does not maintain a hand-written inventory of modules, routes, roles, or entities.

## Architecture baseline

The project uses a modular-monolith-first architecture:

- API: NestJS + TypeScript;
- Web: React + Vite + TypeScript;
- database: PostgreSQL with Prisma schema/migrations;
- workspace/package manager: pnpm workspaces;
- tenant boundary: organization scope;
- reusable UI foundation: the repository's custom CSS/tokens/shared React primitives, per [`ADR_DESIGN_SYSTEM.md`](./adr/ADR_DESIGN_SYSTEM.md).

These are architecture decisions. Current versions, wiring and implementation details must be read from package manifests and code.

## Canonical implementation owners

| Concern | Canonical owner / derived view |
| --- | --- |
| API bootstrap and module wiring | `apps/api/src/main.ts`, `apps/api/src/app.module.ts` |
| Derived AppModule inventory | [`../generated/MODULES.md`](../generated/MODULES.md) |
| API domain code | `apps/api/src/modules/*` |
| API common concerns | `apps/api/src/common/` |
| API config | `apps/api/src/config/` |
| Database model | `apps/api/prisma/schema.prisma` |
| Web route/page composition | `apps/web/src/app/` |
| Web shared code/API wrappers | `apps/web/src/shared/` |
| Web localization | `apps/web/src/i18n/` |
| Web styling | `apps/web/src/styles/` |

The generated module inventory is deterministic and CI-checked; it is not a new authority over `AppModule`.

## API boundaries

A domain module should own its controllers, services, request validation and module-specific tests. Create a new module only when a distinct lifecycle/responsibility does not fit an existing owner.

Preferred dependency direction:

```text
controller -> service -> Prisma/database
controller -> request schema validation
guard/decorator -> common/auth policy
```

Avoid business/database logic in controllers, private-service coupling across unrelated domains, duplicated role checks and unreviewed raw SQL. New API modules must be wired explicitly in `AppModule`.

A module that validates untrusted input into a server-owned snapshot before a separate, single-use commit step (a preview → commit workflow) is not a new architectural pattern: it still follows `controller -> service -> Prisma/database`, with the snapshot persisted and re-validated by the service layer rather than trusted from the client at commit time.

## Database boundary

`apps/api/prisma/schema.prisma` and migrations are the repository authority for database structure. Runtime database access should go through Prisma. Schema/migration changes require explicit migration scope and review with affected services, validation, tests and docs.

Operational migration/backup procedure: [`../runbooks/MIGRATION_BACKUP_POLICY.md`](../runbooks/MIGRATION_BACKUP_POLICY.md).

## Web boundary

`apps/web/src/app/` owns top-level routes/pages and page-level behavior. `apps/web/src/shared/` owns reusable UI, API client primitives/domain wrappers and cross-page helpers. `apps/web/src/i18n/` owns translations; `apps/web/src/styles/` owns styling primitives and global styles.

Preferred direction:

```text
app page -> shared/api domain wrapper
app page -> shared UI/helpers
shared/api domain wrapper -> shared api client
```

Do not move one-off page state into shared code prematurely or introduce a new UI framework without a separate architectural/dependency decision.

## API contract boundary

Runtime OpenAPI plus controllers are the HTTP surface authority. Human semantics/invariants live in [`../contracts/API_CONTRACTS.md`](../contracts/API_CONTRACTS.md); generated API navigation lives in [`../generated/API_INDEX.md`](../generated/API_INDEX.md).

Public path/method/request/response changes must update affected runtime metadata/tests/client/docs review in the same logical PR.

## RBAC boundary

Backend policy/guard enforcement is security authority. Frontend route visibility is UX, not authorization. Current policy inventory is derived in [`../generated/RBAC.md`](../generated/RBAC.md); human semantics are in [`../contracts/API_RBAC_MATRIX.md`](../contracts/API_RBAC_MATRIX.md).

Authorization changes require negative and positive tests at the owning layer.

## Testing and change placement

Use the narrowest meaningful test for the changed layer. Cross-layer contract changes may legitimately touch API + Web + Prisma, but unrelated refactors should remain separate.

Refactor when duplication causes a concrete defect/test gap or a boundary actively blocks safe implementation. Do not move files solely for aesthetics, introduce a new architecture pattern without project-wide need, or use docs-only work to change runtime behavior.

## Documentation rule

This document intentionally contains no hand-maintained module inventory. Any fact that can be deterministically derived from code belongs in `docs/generated/` and remains protected by generation + clean-diff CI.
