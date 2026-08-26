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
| Product/MVP scope | product/scope documents; до DOC-07 — существующие MVP scope docs |
| Architecture rationale | ADR |
| Behaviour semantics / invariants | contracts |
| Operations | runbooks |
| Live environment/platform state | live read-back + dated evidence |
| Active implementation work | GitHub Issue |
| Business/owner decisions | decision/status documents; после DOC-07 — `docs/status/OPEN_DECISIONS.md` |
| UI design reference | prototypes + manifest |
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

## Куда помещать новый документ

Целевая taxonomy проекта:

```text
docs/
├── product/
├── architecture/adr/
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

Реорганизация существующих файлов выполняется отдельными этапами DOC-05…DOC-07. До их завершения существующий путь не означает, что документ автоматически CURRENT или canonical. Новые документы следует размещать по целевой taxonomy только когда нужный каталог уже введён соответствующим этапом; до этого не создавайте частичную параллельную структуру без необходимости.

## Current entry points до завершения реорганизации

Пока DOC-02…DOC-08 не завершены, используйте существующие документы только после проверки их claims по owner-source. Для типичных задач начальные точки такие:

- MVP/product scope: `MVP_SCOPE_LOCK.md`, `MVP_DEFINITION_OF_DONE.md`;
- API/RBAC semantics: `API_CONTRACTS.md`, `API_RBAC_MATRIX.md`;
- local operation: `MVP_LOCAL_RUNBOOK.md` и `runbooks/`;
- release/readiness: `RELEASE_GATE.md`, `READINESS_AND_SECURITY_GATES.md`;
- architecture decisions: `ADR_*.md`, `ARCHITECTURE_MODULE_BOUNDARIES.md`;
- current documentation remediation plan: `documentation_full_remediation_plan_pdca_v3.md`.

Этот список — навигация, а не подтверждение фактической актуальности каждого claim внутри перечисленных файлов. Factual reconciliation выполняет DOC-02.

## Evidence и history

Audit, smoke, production verification, performance verification и аналогичные отчёты описывают то, что наблюдалось в конкретный момент. Они не доказывают текущее состояние без повторной проверки.

`docs/master-context/` содержит pre-implementation context и будет физически перенесён в archive на DOC-05. Уже сейчас его нельзя использовать как authority для current implementation.

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

## Volatile facts

Не создавайте вручную поддерживаемые inventories ролей, endpoints, modules, entities, workflow records или другого состояния, которое надёжно выводится из кода/runtime source. До появления generated docs на DOC-09 current fact читается непосредственно из canonical owner-source.

Live GitHub state, deployment state и environment observations должны проверяться в момент использования. Dated evidence сохраняет только snapshot и не заменяет live read-back.

## Правило для ИИ-агента

Базовый маршрут чтения:

```text
AGENTS.md → docs/README.md → 1–3 task-specific sources → canonical owner-source
```

Не читать весь `docs/` по умолчанию. Archive/evidence открывать только когда задача требует истории или доказательства конкретной проверки.
