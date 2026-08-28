# Документация LMS

Этот файл — единственная current карта документации репозитория. Он определяет, что читать, чему доверять и куда помещать новый документ, не дублируя volatile facts из code/runtime/platform state.

## Как читать

1. Начните с `AGENTS.md` для repository workflow.
2. Определите canonical owner нужного факта по таблице ниже.
3. Читайте только task-relevant current docs.
4. Current implementation fact перепроверяйте по owner-source перед изменением.
5. Evidence/archive не являются authority текущего поведения.

## Canonical owners

| Информация | Canonical owner |
| --- | --- |
| DB entities/enums | `apps/api/prisma/schema.prisma` |
| Допустимый role set | Prisma role enum + shared role constants/types |
| Permissions/RBAC | `apps/api/src/modules/auth/roles.ts` + guards/access policies |
| HTTP API surface | runtime OpenAPI + controllers |
| Nest module wiring | `apps/api/src/app.module.ts` |
| Product/MVP scope | `docs/product/` |
| Architecture rationale | `docs/architecture/adr/` |
| Architecture boundaries | `docs/architecture/ARCHITECTURE_MODULE_BOUNDARIES.md` |
| Behaviour semantics/invariants | `docs/contracts/` |
| Operations | `docs/runbooks/` |
| Repository readiness semantics | `docs/quality/` + exact-SHA CI/CodeQL evidence |
| Active implementation work | GitHub Issues/Project |
| Owner/business decisions | `docs/status/OPEN_DECISIONS.md` |
| UI design reference | prototypes + manifest v2 |
| Live environment/platform state | fresh read-back + dated evidence |
| Historical knowledge | `docs/archive/` / evidence snapshots; not current authority |

If Markdown contradicts an implementation owner-source, the owner-source wins for the implementation fact. Product/architecture decisions do not change automatically; first distinguish factual drift from an intentional decision change.

## Purpose and lifecycle

Purpose and lifecycle are independent.

**Purpose:** decision/explanation; contract/reference; runbook/how-to; tutorial/onboarding only when needed.

**Lifecycle:** `DRAFT` → `CURRENT` → `SUPERSEDED` → archive; evidence is an immutable observed snapshot. A superseded/current stub may remain only to redirect old navigation and must say it is not authority.

## Current taxonomy

```text
docs/
├── product/
├── architecture/
│   └── adr/
├── contracts/
├── runbooks/
├── quality/
├── generated/
├── status/
├── evidence/
├── archive/
├── _meta/
└── lms-ui-prototypes-complete/
```

Root `docs/` is not a writable backlog. Old trackers and the frozen development ledger are historical. The DOC-07 temporary path map was closed on DOC-12 and is preserved only as migration evidence in `docs/archive/remediation/`.

`docs/_meta/active-work-migration.json` is DOC-08 provenance linking retired tracker items to their disposition; it is not a writable backlog. `docs/_meta/ownership.json` is DOC-10 CI impact configuration, not an implementation source of truth.

## Current entry points

- MVP/product scope: [`product/MVP_SCOPE_LOCK.md`](./product/MVP_SCOPE_LOCK.md)
- API semantics: [`contracts/API_CONTRACTS.md`](./contracts/API_CONTRACTS.md)
- RBAC semantics: [`contracts/API_RBAC_MATRIX.md`](./contracts/API_RBAC_MATRIX.md)
- terminology conflicts: [`contracts/GLOSSARY.md`](./contracts/GLOSSARY.md)
- architecture boundaries/decisions: [`architecture/ARCHITECTURE_MODULE_BOUNDARIES.md`](./architecture/ARCHITECTURE_MODULE_BOUNDARIES.md), [`architecture/adr/`](./architecture/adr/)
- local/operational procedures: [`runbooks/`](./runbooks/)
- release/pilot: [`runbooks/RELEASE_GATE.md`](./runbooks/RELEASE_GATE.md), [`runbooks/PILOT_CHECKLIST.md`](./runbooks/PILOT_CHECKLIST.md)
- readiness/security semantics: [`quality/READINESS_AND_SECURITY_GATES.md`](./quality/READINESS_AND_SECURITY_GATES.md)
- owner/business decisions: [`status/OPEN_DECISIONS.md`](./status/OPEN_DECISIONS.md)
- generated current inventories: [`generated/`](./generated/)
- UI prototype governance: [`lms-ui-prototypes-complete/README.md`](./lms-ui-prototypes-complete/README.md), [`lms-ui-prototypes-complete/manifest.json`](./lms-ui-prototypes-complete/manifest.json)
- evidence index: [`evidence/README.md`](./evidence/README.md)
- historical/archive map: [`archive/README.md`](./archive/README.md)

The completed documentation-remediation plan and transitional source-of-truth index remain only as superseded redirect stubs/history; they are not current entry points.

## Active work and decisions

Implementation work has one writable owner: GitHub Issues/Project. New work items use `.github/ISSUE_TEMPLATE/work-item.md`. `docs/status/OPEN_DECISIONS.md` is the only writable Markdown register for owner/business decisions; implementation gaps and live infrastructure state do not belong there as status trackers.

## Generated docs and volatile facts

Do not hand-maintain inventories that are reliably derivable from code/runtime. `docs/generated/` contains derived views and remains CI-enforced through deterministic generation + clean diff.

Live GitHub/deployment/environment facts must be checked when used. Required check names, provider state, deployment state and similar values belong in dated evidence if they need to be recorded.

## Prototype governance

Prototype `designStatus`, implementation state and parity are independent. `designStatus: approved` is design approval only. Unverified implementation/parity remains `unknown`; `implemented` requires `productionRoute`, and `aligned` requires comparison date + SHA. Manifest integrity runs inside documentation consistency CI.

## Documentation review and CI

Review docs in the same PR when public behavior/API/schema/RBAC/config/operations/architecture/user workflow changes. Internal refactors do not require fake Markdown churn.

`docs/_meta/ownership.json` drives fail-closed DOC-10 impact review. `pnpm docs:consistency:test` is the aggregate documentation chain and includes final integrity, prototype governance, impact enforcement and generated drift checks.

## AI route

```text
AGENTS.md → docs/README.md → 1–3 task-specific sources → canonical owner-source
```

Do not read all docs by default. Open archive/evidence only for history or specific verification evidence.
