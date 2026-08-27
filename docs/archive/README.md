# Архив документации

> **HISTORICAL — НЕ CURRENT AUTHORITY.**
>
> `docs/archive/` сохраняет history, rationale и migration provenance. Current facts проверяются через [`../README.md`](../README.md) и canonical owner-sources.

## Pre-implementation master context

`pre-implementation-master-context/` содержит сохранённый исходный набор pre-implementation материалов: 23 numbered-файла и historical `AI_AGENT_STARTER_PROMPT.md`. Они не подвергаются semantic modernization вслед за current code.

## Retired planning / trackers

- `development-ledger/` — frozen historical development ledger;
- `old-trackers/` — бывшие writable planning/status trackers, retired on DOC-08;
- active implementation work после миграции принадлежит GitHub Issues/Project;
- owner/business decisions принадлежат `docs/status/OPEN_DECISIONS.md`.

## DOC-12 remediation archive

`remediation/` сохраняет transition/snapshot artifacts, закрытые финальным audit:

- `PROJECT_SOURCE_OF_TRUTH_PRE_DOC12.md` — полная transitional source-of-truth версия до supersede;
- `documentation_full_remediation_plan_pdca_v3.md` — полный execution plan DOC-01…DOC-12;
- `path-map-doc07.json` — закрытая temporary migration map DOC-07;
- `MVP_DEFINITION_OF_DONE_PRE_DOC12.md` — historical minimum-bar checklist;
- `MVP_READINESS_DASHBOARD_PRE_DOC12.md` — hand-maintained readiness snapshot;
- `RELEASE_GATE_PRE_DOC12.md` — pre-DOC-12 runbook including its old PR-specific verification section.

Эти файлы сохраняются для traceability и не должны становиться dependency current authority/CI semantics. Current redirects/procedures указывают на актуальных owners.

## Правило использования

Archive читают только когда задача требует history/rationale/provenance. Не обновляйте archived artifact feature PR и не используйте его как current implementation, API, RBAC, platform или active-work source.
