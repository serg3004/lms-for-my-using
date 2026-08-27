# Документация LMS

Этот файл — единственная карта документации репозитория. Он определяет, что читать, чему доверять и куда помещать новые документы. Карта описывает правила и владельцев информации, но не дублирует изменчивые факты из кода.

## Как читать документацию

1. Начните с `AGENTS.md` для общих правил работы с репозиторием.
2. Используйте этот файл, чтобы определить тип документа и canonical owner нужного факта.
3. Читайте только документы, относящиеся к текущей задаче.
4. Любой current implementation fact перепроверяйте по canonical owner-source до изменения кода или документации.
5. Evidence и historical материалы не являются authority для текущего поведения.

## Приоритет источников

Для текущего поведения приоритет имеет canonical owner-source. Документ объясняет семантику, решение или процедуру только в пределах своей ответственности.

| Информация | Canonical owner |
|---|---|
| DB entities и enums | `apps/api/prisma/schema.prisma` |
| Допустимый набор ролей | Prisma `Role` + shared role constants/types |
| Permissions / RBAC | `apps/api/src/modules/auth/roles.ts` + guards/access decorators |
| HTTP API surface | runtime OpenAPI + controllers |
| Nest modules | `apps/api/src/app.module.ts` |
| Product/MVP scope | `docs/product/` |
| Architecture rationale | `docs/architecture/adr/` |
| Behaviour semantics / invariants | `docs/contracts/` |
| Operations | `docs/runbooks/` |
| Live environment/platform state | live read-back + dated evidence |
| Active implementation work | GitHub Issues/Project |
| Business/owner decisions | `docs/status/OPEN_DECISIONS.md` |
| UI design reference | `docs/lms-ui-prototypes-complete/` + manifest v2 (`designStatus` only; implementation/parity are separate evidence fields) |
| Historical knowledge | archive/history; не current authority |

Если owner-source и Markdown противоречат друг другу, current implementation fact берётся из owner-source, а расхождение документации исправляется в том же PR либо фиксируется как отдельная документационная задача, если это выходит за scope.

## Две независимые оси классификации

### Назначение

Документ классифицируется по тому, зачем он нужен:

- **decision / explanation** — почему принято решение, архитектурный контекст и trade-offs;
- **contract / reference** — семантика, инварианты, публичные правила и справочная информация;
- **runbook / how-to** — воспроизводимая операционная процедура;
- **tutorial / onboarding** — пошаговое обучение, только если такой документ действительно нужен.

### Lifecycle

Назначение не определяет актуальность. Отдельно используется lifecycle:

- **DRAFT** — ещё не утверждён как current guidance;
- **CURRENT** — актуальный нормативный документ в своей области;
- **SUPERSEDED** — заменён более новым документом или решением;
- **EVIDENCE** — снимок наблюдения/проверки на дату, SHA и/или environment;
- **HISTORICAL** — сохранён для истории и не является current authority.

ADR, contract или runbook могут быть CURRENT или SUPERSEDED. Evidence — immutable snapshot: его не «осовременивают» вслед за изменением кода.

## Current taxonomy

Current normative documentation организована по назначению:

```text
docs/
├── product/
│   └── future/
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

Root `docs/` больше не является writable backlog. Frozen development ledger и старые trackers находятся в `docs/archive/`; их нельзя обновлять feature PR.

`docs/_meta/path-map.json` — временная карта old→new путей DOC-07 для migration/link audit. Она не является source of truth и должна быть удалена либо архивирована на DOC-12 после финального link audit.

`docs/_meta/active-work-migration.json` — migration/provenance map DOC-08. Она связывает старые tracker IDs с GitHub work items, owner decisions, live verification или historical disposition и не является новым writable backlog.

`docs/_meta/ownership.json` — CI enforcement map DOC-10. Она связывает публично значимые `sourceGlobs` с `generatedTargets` и current `manualTargets`; это конфигурация проверки impact, а не новый canonical owner implementation facts.

## Active work и decisions

Active implementation work имеет один writable owner: GitHub Issues/Project. Новый implementation work item создаётся через `.github/ISSUE_TEMPLATE/work-item.md` и должен содержать цель, scope, критерии готовности, risk/rollback и docs impact.

`docs/status/OPEN_DECISIONS.md` содержит только owner/business decisions. Implementation gap нельзя вести там как task status. Live infrastructure state нельзя закрывать решением в Markdown — требуется fresh read-back и при необходимости dated evidence.

## Current entry points

Для типичных задач начальные точки такие:

- MVP/product scope: `product/MVP_SCOPE_LOCK.md`, `product/MVP_DEFINITION_OF_DONE.md`;
- API/RBAC semantics: `contracts/API_CONTRACTS.md`, `contracts/API_RBAC_MATRIX.md`;
- terminology conflicts: `contracts/GLOSSARY.md`;
- UI prototype governance: `lms-ui-prototypes-complete/README.md`, `lms-ui-prototypes-complete/manifest.json`;
- local operation: `runbooks/MVP_LOCAL_RUNBOOK.md` и `runbooks/`;
- release/readiness: `runbooks/RELEASE_GATE.md`, `quality/READINESS_AND_SECURITY_GATES.md`;
- architecture decisions: `architecture/adr/ADR_*.md`, `architecture/ARCHITECTURE_MODULE_BOUNDARIES.md`;
- owner/business decisions: `status/OPEN_DECISIONS.md`;
- current documentation remediation plan: `documentation_full_remediation_plan_pdca_v3.md`.

Этот список — навигация, а не подтверждение фактической актуальности каждого claim внутри перечисленных файлов. Current implementation facts по-прежнему проверяются по canonical owner-source.

## Prototype governance

Prototype design approval, production implementation и parity — независимые состояния. `designStatus: approved` в `lms-ui-prototypes-complete/manifest.json` означает только approved design reference и не доказывает production implementation. Непроверенные implementation/parity остаются `unknown`; verified `implemented` требует `productionRoute`, а `aligned` — дату и Git SHA сравнения. Integrity manifest проверяется `pnpm docs:prototype:test` внутри `docs:consistency:test`.

Короткий [`contracts/GLOSSARY.md`](contracts/GLOSSARY.md) используется только для повторяющихся терминологических конфликтов и не заменяет canonical owner-source или полный domain contract.

## Evidence и history

Audit, smoke, production verification, performance verification и аналогичные отчёты описывают то, что наблюдалось в конкретный момент. Они не доказывают текущее состояние без повторной проверки. Evidence отделён в `docs/evidence/`; lifecycle, metadata и текущий index находятся в `docs/evidence/README.md`.

Pre-implementation context, frozen development ledger и старые trackers физически отделены от current knowledge в `docs/archive/`. Это historical material и не является authority для current implementation или active work.

## Documentation review при изменениях

В том же PR необходимо проверить документацию, если меняются:

- публичное поведение или API;
- schema/data model;
- RBAC/authorization semantics;
- конфигурация или environment variables;
- команды запуска, deploy или migration procedure;
- архитектурные границы;
- пользовательский workflow или documented limitation/error behaviour.

Если изменение внутреннее и документируемое поведение не меняется, фиктивный Markdown diff не нужен.

`pnpm docs:impact:test` валидирует `docs/_meta/ownership.json` fail-closed: source globs должны иметь tracked matches, generated/manual targets должны существовать, а конфликтующие mappings считаются ошибкой. В Pull Request changed mapped sources вычисляются локальным `git diff` по base/head SHA из `GITHUB_EVENT_PATH`, без GitHub API.

Для mapped source change PR должен либо изменить хотя бы один соответствующий `manualTargets`, либо содержать строку `Docs-Impact: reviewed-no-change — <конкретная причина>`. Пустые/N/A/TBD причины не принимаются. `generatedTargets` защищаются `docs:generate:check`; на `push`/локальном запуске без PR metadata body не требуется, но schema/paths и generation всё равно проверяются в always-running docs chain.

## Volatile facts

Не создавайте вручную поддерживаемые inventories ролей, endpoints, modules, entities, workflow records или другого состояния, которое надёжно выводится из кода/runtime source. Derived inventories в `docs/generated/` не являются canonical owners и проверяются через deterministic generation + clean diff.

Live GitHub state, deployment state и environment observations должны проверяться в момент использования. Dated evidence сохраняет только snapshot и не заменяет live read-back.

## Правило для ИИ-агента

Базовый маршрут чтения:

```text
AGENTS.md → docs/README.md → 1–3 task-specific sources → canonical owner-source
```

Не читать весь `docs/` по умолчанию. Archive/evidence открывать только когда задача требует истории или доказательства конкретной проверки.
