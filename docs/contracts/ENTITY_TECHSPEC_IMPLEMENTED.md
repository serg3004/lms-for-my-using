# Implemented entity techspec — superseded

> **Статус:** `SUPERSEDED` на DOC-12.
>
> Этот путь сохранён только как redirect для старой навигации. Он **не является** current authority для entity inventory, schema или RBAC.

Manual snapshot этого документа был retired, потому что он вручную дублировал volatile Prisma/RBAC facts и мог дрейфовать от canonical owner-sources.

## Current owners

- persisted DB entities/enums → `apps/api/prisma/schema.prisma`;
- generated entity inventory → `docs/generated/ENTITIES.md`;
- RBAC/permissions → `apps/api/src/modules/auth/roles.ts` + guards/access policies;
- generated RBAC inventory → `docs/generated/RBAC.md`;
- human API/RBAC semantics → `docs/contracts/API_RBAC_MATRIX.md`;
- migration/rollback semantics → `docs/runbooks/MIGRATION_BACKUP_POLICY.md`.

Historical pre-DOC-12 snapshot preserved byte-for-byte at `docs/archive/remediation/ENTITY_TECHSPEC_IMPLEMENTED_PRE_DOC12.md`.

Do not update the archived snapshot to match current code. If current generated inventory is stale, use the generated-artifact recovery process in `AGENTS.md`.