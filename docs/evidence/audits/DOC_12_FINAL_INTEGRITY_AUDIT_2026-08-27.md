# DOC-12 Final Documentation Integrity / Freshness Audit

> **Lifecycle:** `EVIDENCE`  
> **Observed:** 2026-08-27  
> **Rebaseline main SHA:** `c9759e4f520b3c2c0ae3ddbb602880fba8389f29`  
> **Scope:** documentation governance series DOC-01…DOC-12; repository/documentation state only. Live production services are not inferred from repository state.

## Baseline read-back

Before DOC-12 changes:

- PR #734 / DOC-11 was merged into `main` at `c9759e4f520b3c2c0ae3ddbb602880fba8389f29`.
- Post-merge CI run `33098672152` / run #1828 completed `success`.
- Post-merge CodeQL run `33098672166` / run #1333 completed `success`.
- GitHub ruleset `Protect main` (id `21443396`) was read live: active on the default branch, PR required, non-fast-forward/deletion protected, strict required checks enabled; required contexts observed were `Checks` and `Analyze (javascript-typescript)`.
- Classic branch-protection endpoint returned `403 Resource not accessible by integration`; this audit therefore records the active repository ruleset as the accessible live enforcement source and does not invent classic-protection state.

## Rebaseline findings and disposition

| Finding | Classification | DOC-12 action |
| --- | --- | --- |
| `PROJECT_SOURCE_OF_TRUTH.md` still declared a transitional CURRENT index until DOC-12 | still-valid | preserve pre-DOC-12 content in archive; replace current file with explicit `SUPERSEDED` redirect to owners |
| `_meta/path-map.json` still `TEMPORARY` with DOC-12 exit condition | still-valid | preserve as migration evidence; remove current `_meta` copy |
| remediation plan still `CURRENT execution plan` | still-valid | preserve full plan; replace current file with completed/superseded redirect |
| MVP Definition of Done described itself as an already-cleared historical minimum but remained a current product entry point | changed / duplicate lifecycle | preserve historical version; supersede current stub in favor of scope + release/pilot owners |
| MVP readiness dashboard mixed volatile implementation/live state in a hand-maintained status summary | still-valid manual volatility | preserve snapshot; supersede dashboard in favor of exact-SHA CI/live evidence + scope/decisions |
| architecture and RBAC docs manually duplicated code-derived inventories | still-valid | replace inventories with stable semantics + links to generated/owner sources |
| API/readiness/release/pilot docs contained stale moved paths and PR/snapshot-specific current statements | still-valid | correct current navigation and remove snapshot claims from current procedures; preserve historical release snapshot |
| evidence index contained explicitly unknown historical metadata | acceptable | keep missing metadata explicit; do not fabricate date/SHA/environment |

## Final evidence matrix

| Criterion | Canonical owner/source | Verification | Result / evidence |
| --- | --- | --- | --- |
| One documentation map | `docs/README.md` | current navigation + integrity test | PASS in DOC-12 tree; PR CI confirmation pending |
| One AI workflow authority | `AGENTS.md` | existing AI-entry consistency tests | PASS on baseline; PR CI confirmation pending |
| Active work owner | GitHub Issues/Project + templates | DOC-08 migration + template/workflow tests | PASS on baseline; retained |
| Owner/business decisions only in Markdown decision registry | `docs/status/OPEN_DECISIONS.md` | DOC-08 consistency invariant | PASS on baseline; retained |
| Current docs do not depend on archived `DEVELOPMENT_PLAN` as writable owner | templates/workflows/current owners | consistency/integrity tests + search | PASS for templates/workflows; current historical provenance may point to archive only |
| Transitional `PROJECT_SOURCE_OF_TRUTH` closed | `docs/README.md` + domain owners | superseded redirect + archived original | PASS in DOC-12 tree |
| Mixed `TODO_VERIFY` registry retired | archive + current product/decision owners | old current path absent; stale current references removed/CI-audited | PR CI confirmation pending |
| Temporary DOC-07 path map closed | current `_meta` + archive migration evidence | current path absent; archived original present | PASS in DOC-12 tree |
| History/evidence preserved and isolated | `docs/archive/`, `docs/evidence/` | archive/evidence consistency tests | PASS in DOC-12 tree; PR CI pending |
| Module inventory not hand-maintained | `apps/api/src/app.module.ts` | generated `docs/generated/MODULES.md` + strict generation | PASS; architecture manual inventory removed |
| RBAC inventory not hand-maintained | `rolePolicies` + Prisma/shared roles | generated `docs/generated/RBAC.md` + strict generation | PASS; manual role/controller inventory removed |
| API inventory not hand-maintained | runtime OpenAPI + controllers | generated API index + docs generation check | PASS in design; PR CI pending |
| Manual docs protected by source-impact review | `docs/_meta/ownership.json` | `docs:impact:test` in aggregate docs chain | baseline PASS; PR CI pending |
| Broken current local links/paths block CI | current taxonomy/entry points | consistency + new `docs:integrity:test` | enabled in DOC-12 tree; PR CI pending |
| Prototype governance remains enforced | prototype manifest v2 | `docs:prototype:test` in aggregate docs chain | baseline PASS; PR CI pending |
| Generated drift remains strict | generator owners | `docs:generate:check` through impact/consistency chain | baseline PASS; PR CI pending |
| Repository required CI chain | `.github/workflows/ci.yml` | exact-SHA GitHub Actions | baseline `main` run #1828 PASS; DOC-12 PR run pending |
| CodeQL | `.github/workflows/codeql.yml` | exact-SHA GitHub Actions | baseline `main` run #1333 PASS; DOC-12 PR run pending |
| Merge enforcement | live GitHub ruleset | ruleset id `21443396` read-back | PASS: active strict ruleset; current contexts recorded above |
| Classic branch-protection endpoint | GitHub platform | REST read | **[НЕ ПРОВЕРЕНО]** integration returned 403; active ruleset read-back available and used instead |
| `pnpm agent:preflight` executable invocation | repository script | direct shell execution | **[НЕ ПРОВЕРЕНО]** GitHub connector provides repository/Actions access but no arbitrary repository shell; CI executes `agent:preflight:test` and full PR checks instead |
| External HTTP links | external sites | periodic/non-blocking audit | **[НЕ ПРОВЕРЕНО]** no mandatory external-link checker is configured for this series; local links/paths are blocking |
| Live production providers/deployment | external environment owners | live environment read-back | **[НЕ ПРОВЕРЕНО]** not required to prove repository documentation integrity and no production connector was used |

## Permanent checks after DOC-12

`pnpm docs:consistency:test` remains the aggregate documentation gate and is extended with `docs:integrity:test`. The final chain covers stable governance/link invariants, DOC-12 transition closure, prototype governance, source-to-doc impact enforcement and strict generated drift.

Manual module/RBAC inventories are deliberately no longer compared to code. Their equivalent current inventories are deterministic generated artifacts, so the existing generation check is the stronger owner-backed invariant.

## Closure condition

This evidence becomes the final DOC-12 repository closure record when the DOC-12 pull request CI and CodeQL complete successfully on the final head SHA. If a required PR check fails, the matrix must be updated only after the failure is corrected and the final head is re-verified.
