# План полной реорганизации документации LMS

> **Version:** 3
> **Status:** CURRENT execution plan; planning document, не implementation authority.
> **Verified snapshot:** `main` = `a7dcd5bc9c99a30f83a3a74404555a661ba0d714` (verified 2026-08-26).
> **Supersedes:** v2 snapshot `f35498cf0af010103e27c2f98b547553e3c1a7ca`.
> **Execution rule:** перед каждым этапом MUST выполнить task-scoped rebaseline на актуальный `main`.
> `DOC-01…DOC-12` — стабильные идентификаторы этапов; реальные номера GitHub PR назначаются GitHub и не резервируются заранее.
> `DONE` всей серии разрешён только после DOC-12.

## Статус и предел достоверности

Документ фиксирует три разных класса информации:

1. устойчивые правила целевого устройства документации;
2. проверенные findings на указанном `Verified snapshot`;
3. процедуру повторной проверки volatile facts перед каждым этапом.

Snapshot-факт MUST NOT использоваться как вечная current truth. Если `main` изменился после `Verified snapshot`, исполнитель MUST перепроверить только owner-sources, относящиеся к текущему этапу, и скорректировать scope без механического повторения уже исправленных действий.

## Основание

[ФАКТ на snapshot `a7dcd5bc…`] Повторная сверка current tree, owner-sources и GitHub state подтвердила:

- `docs/README.md` отсутствует; в `AGENTS.md` нет documentation governance.
- `docs/` смешивает current docs, ADR, plans/status, audits/evidence и history.
- `docs/master-context/` содержит 23 файла старого pre-implementation/AI context рядом с current docs.
- `PROJECT_SOURCE_OF_TRUTH` и `API_CONTRACTS` содержат stale implementation claims; `TODO_VERIFY` частично уже исправлен и потому не должен обновляться по заранее заданному списку.
- Current code содержит роль `mentor`, `NotificationsModule`, `AuditLogModule`, Prisma models `Notification`/`AuditLog`, UI surfaces для notifications/admin audit log и `GET /courses/summary`.
- Password-reset request/confirm реализованы в `AuthController`/`AuthService`; старый `503` допустим только как historical evidence.
- Production verification evidence фиксирует использование `prisma migrate deploy`; current README не должен утверждать обратное.
- `docs:consistency:test` существует, но current `.github/workflows/ci.yml` его не запускает.
- `DEVELOPMENT_PLAN.md` остаётся крупным активно изменяемым ledger; точный размер — snapshot-метрика, не устойчивый факт.
- Legacy manual OpenAPI endpoint помечен deprecated; current API description формируется runtime OpenAPI, JSON доступен через `/api/v1/api-json`.
- `.github/pull_request_template.md` требует `Plan PR`/ссылку на `DEVELOPMENT_PLAN.md`.
- `.github/ISSUE_TEMPLATE/` отсутствует.
- `CLAUDE.md` содержит общий workflow, конфликтующий с `AGENTS.md`, и machine-specific/volatile context.
- Prototype manifest использует один `status`, который не разделяет design approval, implementation state и parity.
- `ORG_STRUCTURE_IMPLEMENTATION_PLAN.md` и `ORG_STRUCTURE_PR_PLAN.md` резервируют будущие PR 266–284 и продолжают опираться на `DEVELOPMENT_PLAN.md`.
- Current org/security planning содержит manager/group object-scope authorization work; при миграции backlog этот work item MUST быть сохранён, а security-код в remediation-серии не меняется.
- На snapshot в Git tree находятся 4 workflow YAML, а GitHub Actions API возвращает 9 workflow records; live platform state нельзя хранить как вечный Markdown inventory.
- Current aggregate CI check `Checks` зависит от `quality`, `tests`, `build`, `e2e`, `accessibility`, `visual`, `containers`; это snapshot implementation detail, а не вечное имя/топология CI.

## Результат четырёх PDCA-циклов

| Цикл | Проверка | Найдено | Коррекция |
|---|---|---|---|
| PDCA 1 | внутренняя логика + GitHub templates | PR template зависит от `DEVELOPMENT_PLAN`; не было path migration map | дополнить DOC-07/08/10 |
| PDCA 2 | история и current code/docs | появился Audit Log, docs отстали; ledger регулярно требует ремонта | усилить reconciliation и убрать manual volatile inventories |
| PDCA 3 | GitHub Docs, Diátaxis, OpenAPI, Docs as Code | purpose ≠ lifecycle; path-filtered required workflow опасен; full OpenAPI copy избыточна | уточнить DOC-01/03/09/10/12 |
| PDCA 4 | rebaseline на `a7dcd5bc…` + adversarial pass | v2 baseline устарел; `TODO_VERIFY` частично исправлен; появились org plans с PR 266–284; `Issues/Project` двусмысленно; `path-map` мог стать stale registry; role-set и permissions имели смешанный ownership | ввести rebaseline policy, claim matrix, Issue-as-owner, lifecycle path-map, split role-set/permissions, deterministic generation |

**Не подтверждено как необходимость:** отдельный PR для CODEOWNERS, новый documentation framework, обязательный внешний link-check в каждом PR, новые зависимости. Эти решения пересматриваются только при появлении подтверждённой потребности.

## Границы

Входит: governance, factual reconciliation, taxonomy, archive/evidence, AI context, active-work ownership, generated docs, CI integrity, prototypes.

Не входит: product behaviour, production changes и исправление security-кода. Security finding получает отдельный work item.

## Схема доверия

```text
AGENTS.md
   ↓
docs/README.md  ← map / taxonomy / ownership
   ↓
task-specific document
   ├─ product/ADR      → решение/почему
   ├─ contract         → семантика/инварианты
   ├─ runbook          → как выполнить операцию
   ├─ evidence         → что наблюдалось тогда
   └─ archive          → история, НЕ current authority
          ↓
current implementation fact → code / Prisma / policies / runtime OpenAPI / config / tests
```

## Ownership

| Факт | Canonical owner | Примечание |
|---|---|---|
| DB entities/enums | Prisma schema | Generated inventory не становится owner |
| Допустимый role set | Prisma `Role` + shared role type | CI MUST выявлять расхождение |
| Permissions/RBAC | `rolePolicies` + guards/access decorators | Не выводить permissions из Prisma enum |
| API surface | runtime OpenAPI + controllers | Runtime document строится из current metadata |
| Nest modules | `AppModule` | Generated inventory — derived artifact |
| Product/MVP scope | `docs/product/` | После DOC-02/07 |
| Architecture rationale | ADR | Decision owner, не implementation inventory |
| Behaviour semantics | contracts | Manual semantics/invariants |
| Operations | runbooks | Procedure, не execution evidence |
| Live observation | dated evidence + live read-back | Snapshot не является current platform state |
| Active implementation work | GitHub Issue | GitHub Project MAY быть view/board, но не вторым writable owner |
| Business/owner decisions | `status/OPEN_DECISIONS.md` | Только решения, не implementation backlog |
| Old design/history | archive | Не current authority |
| UI design reference | prototypes + manifest | Design reference ≠ implementation authority |

## Lifecycle

```text
contract/decision/runbook: DRAFT → CURRENT → SUPERSEDED → ARCHIVE
evidence:                 OBSERVED(date/SHA/env) → immutable snapshot
generated:                SOURCE → GENERATE → CI clean-diff
work:                     OPEN GitHub Issue → DONE/CLOSED
migration-map:            TEMPORARY → verified in DOC-12 → REMOVE or ARCHIVE
```

GitHub Project может представлять Issues, но не хранит независимую canonical task truth.

## Общие правила серии

- Каждый DOC-этап реализуется отдельным логическим PR, если rebaseline не докажет, что безопаснее объединить только неразделимые изменения.
- Перед каждым DOC-этапом MUST: прочитать актуальный HEAD `main`; проверить task-specific owner-sources; классифицировать snapshot findings как `still-valid / already-fixed / changed / new`; скорректировать scope до изменения файлов.
- Уже исправленное повторно не менять.
- Snapshot counts, sizes, workflow records, required-check names и иные live facts MUST датироваться/SHA-bind или заменяться live verification instruction.
- Mass `git mv` и semantic rewrite не смешивать без необходимости.
- Historical/evidence сохранять; не «осовременивать» историю.
- После DOC-03 обязательны docs checks + `agent:preflight` + релевантный CI.
- Не добавлять dependency, если достаточно текущего Node/tooling.
- Не хранить future PR numbers; использовать `DOC-*`, Issue ID или устойчивый domain ID.
- Checkpoints обязательны после DOC-03, DOC-06 и DOC-10.

---

# DOC-01 — [P0] Documentation governance

### Цель
Дать человеку и ИИ единый короткий ответ: что читать, чему доверять и куда класть новый документ.

### Что необходимо сделать
- Создать `docs/README.md`: precedence, ownership и две независимые оси — purpose и lifecycle.
- Purpose: decision/explanation, contract/reference, runbook/how-to, tutorial/onboarding только если реально нужен.
- Lifecycle: draft/current/superseded/evidence/historical.
- Добавить в `AGENTS.md` ≤30 строк Documentation Rules: task-relevant reading; owner-source verification; docs review при behaviour/API/config/schema change; archive/evidence не current authority; не создавать manual inventory, если факт выводится из кода.
- Не помещать в `AGENTS.md` роли/endpoints/topology.
- SHA обязателен для snapshot/evidence, но не как глобальная печать актуальности mutable contract.

### Критерии готовности
- [ ] Для каждого типа информации указан owner.
- [ ] `docs/README.md` — единственная documentation map.
- [ ] `AGENTS.md` задаёт процесс, не копирует domain knowledge.
- [ ] Нет массовых moves/rewrite.

---

# DOC-02 — [P0] Reconcile current truth

### Цель
Удалить подтверждённые противоречия из entry-point/CURRENT docs без механического применения stale findings.

### Что необходимо сделать
На актуальном `main` построить reconciliation matrix:

```text
claim → document/path → canonical owner-source → verdict → action
```

`verdict`: `correct`, `stale`, `historical`, `live-verify`, `ambiguous-owner`.
`action`: `keep`, `update`, `mark-historical`, `replace-with-live-verify`, `defer-with-owner`.

Минимальный scope: root `README.md`, `PROJECT_SOURCE_OF_TRUTH`, `MVP_SCOPE_LOCK`, `TODO_VERIFY`, `MVP_DEFINITION_OF_DONE`, `API_CONTRACTS` и связанные current status/security/API docs.

Snapshot findings для повторной проверки, а не слепого применения: `mentor`; Notifications; Admin Audit Log; password-reset; `/courses/summary`; `prisma migrate deploy`; live GitHub protection/workflows.

`PROJECT_SOURCE_OF_TRUTH` оставить только как transitional decisions/precedence index; volatile inventories убрать. В MVP docs разделить scope decision и implementation. Если snapshot finding уже исправлен — action = `keep`.

### Критерии готовности
- [ ] Для каждого изменённого claim есть owner-source и verdict.
- [ ] Entry-point/CURRENT docs не противоречат проверенным owner-sources.
- [ ] Decision / implementation / live observation разделены.
- [ ] Historical facts явно historical.
- [ ] Уже исправленные claims не переписаны повторно.
- [ ] Ничего не исправлено «по памяти».

---

# DOC-03 — [P0] Docs consistency как CI gate

### Цель
Остановить новый drift до массовых moves.

### Что необходимо сделать
- Включить `pnpm docs:consistency:test` в always-running CI chain, failure которой достигает фактически required aggregate check.
- На snapshot подходящее место — `quality`, aggregate job — `Checks`; перед реализацией эти имена MUST live-verify.
- Не создавать отдельный required docs-workflow с `paths`/branch filters.
- Сохранить existing invariants `AppModule↔modules` и `CourseAccessGuard↔RBAC`, если rebaseline подтверждает их актуальность.
- Добавить проверки существования локальных путей/ссылок из `docs/README.md` и current entry points.
- Archive/evidence исключить из current-code equivalence checks.
- Проверить branch-protection policy tests; live ruleset read-back оставить DOC-12.

### Критерии готовности
- [ ] Docs test реально выполняется в PR CI.
- [ ] Нарушение invariant ломает required CI chain.
- [ ] History не ломается из-за эволюции current code.
- [ ] Existing CI не ослаблен.
- [ ] Required docs check не зависит от workflow-level `paths` filter.
- [ ] Имена jobs/checks не закреплены как вечные facts.

---

# DOC-04 — [P0] Единые AI entry points

### Цель
Сделать `AGENTS.md` единственным общим workflow authority.

### Что необходимо сделать
- `CLAUDE.md` → thin adapter к `AGENTS.md` + `docs/README.md`; оставить только Claude-specific правила.
- Убрать конфликтующие branch/PR инструкции, Windows paths, volatile URL/demo context.
- Старый `AI_AGENT_STARTER_PROMPT` сохранить в archive; active starter заменить `AGENTS.md → docs/README.md → task-specific sources`.
- Удалить stale private-repo/framework/ORM/storage/role claims и неверные root paths.
- `.claude/settings.json` оставить config, не workflow authority.
- CI проверяет links всех active agent entry points.

### Критерии готовности
- [ ] Общие правила AI существуют только в `AGENTS.md`.
- [ ] Active AI docs не отправляют в history как authority.
- [ ] Нет machine-specific/volatile context в provider adapter.
- [ ] Agent links проходят CI.

---

# DOC-05 — [P0] Archive pre-implementation context

### Цель
Физически отделить старый master-context от current knowledge.

### Что необходимо сделать
- `git mv docs/master-context/` → `docs/archive/pre-implementation-master-context/`.
- Сохранить все 23 файла без semantic modernization.
- Создать `archive/README.md` + historical banner/index.
- Переместить туда сохранённый старый AI starter.
- Обновить legitimate historical links; запретить current→archive authority links.

### Критерии готовности
- [ ] Все 23 файла сохранены.
- [ ] Путь/banner однозначно означают historical.
- [ ] Нет current implementation dependency на archive.
- [ ] Rename не теряет информацию.

---

# DOC-06 — [P1] Evidence отдельно от contracts/runbooks

### Цель
Разделить нормативное знание и доказательство конкретной проверки.

### Что необходимо сделать
Создать `evidence/{audits,production,performance,security,observability,smoke,incidents}/` и через `git mv` перенести по смыслу `PR*_VERIFICATION*`, audits, smoke snapshots, incident tabletop и другие dated verification/status reports.

Stable incident/backup/SLO procedures оставить runbooks. Evidence хранит `observed_at`, а SHA/environment — только когда известны и релевантны.

### Критерии готовности
- [ ] Audit/verification snapshot не лежит среди current contracts.
- [ ] Runbook ≠ execution result.
- [ ] Evidence не переписывает прошлое.
- [ ] Все ссылки сохранены.

---

# DOC-07 — [P1] Current taxonomy через `git mv`

### Цель
Сделать тип current-документа понятным по пути и уменьшить AI reading scope.

### Что необходимо сделать
После rebaseline создать `product/`, `product/future/`, `architecture/adr/`, `contracts/`, `runbooks/`, `quality/`, `status/`, `generated/`, `_meta/`.

Перед move создать migration matrix:

```text
oldPath → purpose → lifecycle → newPath → inbound references → scripts/tests/CI consumers
```

- ADR → `architecture/adr/`; architecture/CSS → `architecture/`; auth/API/storage semantics → `contracts/`; MVP scope → `product/`; future entities → `product/future/`; procedures → `runbooks/`; quality policies → `quality/`.
- `ENTITY_TECHSPEC_IMPLEMENTED` оставить human semantics; volatile inventory уберёт DOC-09.
- Prototype package не двигать.
- Создать временный `_meta/path-map.json` только для migration/link audit.
- `path-map` MUST NOT становиться perpetual source of truth: после DOC-12 удалить либо архивировать как migration evidence.
- Обновить links/scripts/tests/CI paths. Content не переписывать вместе с mass moves, кроме path/link corrections.

### Критерии готовности
- [ ] Назначение current doc видно из пути.
- [ ] Root `docs/` больше не склад разнотипных Markdown.
- [ ] Scripts/tests используют новые paths.
- [ ] Для каждого moved file есть old→new mapping и проверенные consumers.
- [ ] Docs/link checks проходят.
- [ ] `path-map` имеет exit condition DOC-12.

---

# DOC-08 — [P1] Один active backlog и frozen development ledger

### Цель
Прекратить конкурирующие статусы, future-PR reservation и append-only `DEVELOPMENT_PLAN`.

### Что необходимо сделать
- `DEVELOPMENT_PLAN.md` → immutable `archive/development-ledger/`.
- Canonical writable active implementation work → **GitHub Issue**.
- GitHub Project MAY быть board/view над Issues, но MUST NOT хранить независимый canonical status.
- `status/OPEN_DECISIONS.md` → только owner/business decisions.
- Rebaseline всех trackers/plans, включая `TODO_VERIFY`, `CONCERNS`, `RECOMMENDATIONS`, hardening backlog, frontend roadmap, `ORG_STRUCTURE_IMPLEMENTATION_PLAN.md`, `ORG_STRUCTURE_PR_PLAN.md`, branch-protection future work и новые planning/status docs.
- Для каждого open item создать/связать ровно один canonical destination; сохранить mapping `old id/path → issue/decision`.
- Убрать future-task numbering вида `PR 266…284`; использовать Issue ID или stable `SEC/ORG/DOC-*`.
- Обновить PR template: `Work item: #issue | stable-id | N/A`, без `Plan PR`/`DEVELOPMENT_PLAN`.
- Добавить минимальный `.github/ISSUE_TEMPLATE/work-item.md`; YAML form — только после повторной проверки preview/status и пользы.
- Сохранить manager/group security work отдельным work item; код не менять.
- Проверить scripts/workflows/templates/current docs: ничто не должно append или требовать update archived ledger.

### Критерии готовности
- [ ] У active task один writable owner: GitHub Issue.
- [ ] Project, если используется, является view над Issues.
- [ ] Feature PR больше не обновляет development ledger.
- [ ] Все open items имеют mapping либо доказанно закрыты как no-longer-applicable.
- [ ] Org-structure planning не резервирует future PR numbers.
- [ ] Security finding не потерян.
- [ ] Нет current consumers, пишущих в archived ledger.
- [ ] PR template больше не зависит от `DEVELOPMENT_PLAN`.
- [ ] Есть минимальный work-item template.

---

# DOC-09 — [P1] Generated volatile inventories

### Цель
Исключить тихий drift API/RBAC/modules/entities.

### Что необходимо сделать
Добавить deterministic `docs:generate`:

- `generated/RBAC.md` ← role-set consistency + `rolePolicies`/guards/access decorators;
- `generated/MODULES.md` ← `AppModule`;
- `generated/ENTITIES.md` ← Prisma;
- `generated/API_INDEX.md` ← runtime OpenAPI metadata как компактный method/path/tag/auth index.

Правила:
- допустимые роли должны совпадать между Prisma `Role` и shared role type; permissions принадлежат `rolePolicies`/guards/access metadata;
- API authority = runtime OpenAPI + controllers; не коммитить вторую полную копию OAS/DTO;
- API generator использует current `createOpenApiDocument`/test bootstrap, не production URL;
- human docs сохраняют conventions/invariants/boundaries/rationale;
- использовать project/runtime APIs вместо regex parsing, где возможно без новой зависимости;
- output deterministic: стабильная сортировка/format, без timestamps, absolute machine paths и host-specific values;
- generator fail-closed при невозможности прочитать/собрать authoritative source;
- CI: `generate → clean diff`; idempotence: `generate → generate → zero diff`.

### Критерии готовности
- [ ] Route/permission/module/entity/role-set change не может тихо оставить generated docs stale.
- [ ] Generation deterministic и idempotent.
- [ ] Второй запуск даёт zero diff.
- [ ] Source-read failure приводит к failure, а не partial success.
- [ ] API index не дублирует полный OpenAPI/DTO.
- [ ] Human semantics сохранены.
- [ ] Public compatibility не нарушена.
- [ ] Новые dependencies не добавлены без необходимости.

---

# DOC-09.1 — [P1] Stale generated artifacts remediation

### Цель
Зафиксировать единый способ устранения stale generated artifacts без ручного редактирования generated outputs и без ослабления strict CI gate.

### Что необходимо сделать
- В `AGENTS.md` закрепить алгоритм работы со stale generated artifacts: запустить `pnpm docs:generate:check`; при drift выполнить `pnpm docs:generate`, просмотреть фактический diff generated files и сверить его с authoritative sources; generated files вручную не редактировать; затем повторно запустить `pnpm docs:generate:check`.
- В `docs/generated/README.md` добавить troubleshooting: команда восстановления, как читать diff, что делать при неожиданном/пустом/частичном output и когда исправлять generator/authoritative source вместо generated Markdown.
- В `scripts/check-generated-docs.mjs` сохранить полезную диагностику с фактическим `git diff` и GitHub annotation/summary; stale state MUST по-прежнему завершаться non-zero.
- Проверить, что `pnpm docs:generate:check` остаётся строгим: stale artifacts ломают check, clean generated state проходит; после remediation check зелёный.
- DOC-09.1 реализовать как один work item → одна branch → один PR; unrelated changes не включать.

### Критерии готовности
- [ ] `AGENTS.md` содержит воспроизводимый алгоритм recovery для stale generated artifacts.
- [ ] `docs/generated/README.md` содержит troubleshooting для generated drift.
- [ ] `scripts/check-generated-docs.mjs` показывает фактический diff/annotation и не скрывает drift.
- [ ] Stale generated state даёт non-zero; clean generated state даёт zero; финальный `pnpm docs:generate:check` зелёный.
- [ ] Весь DOC-09.1 выполнен одной задачей → одной веткой → одним PR.

---

# DOC-10 — [P1] Source→docs impact enforcement

### Цель
Защитить manual contracts/runbooks, которые нельзя полностью генерировать.

### Что необходимо сделать
Создать `_meta/ownership.json` для публично значимых source globs. Schema MUST явно различать `sourceGlobs`, `generatedTargets`, `manualTargets`, optional `reason/scope`.

Минимальное покрытие: Prisma → data contracts/generated entities; roles/auth/guards → auth/RBAC; controllers/API metadata → generated API/manual API semantics; env/config → deploy/config docs; migration/deploy scripts → runbooks; security/release workflow → quality/release docs.

Добавить `docs:impact:test`:
- на PR вычислять changed mapped sources через `git diff` по base/head SHA из GitHub event, без GitHub API;
- обеспечить достаточную git history/base availability;
- generated targets проверять автоматически;
- manual owner-doc либо изменён, либо PR содержит `Docs-Impact: reviewed-no-change — <причина>`;
- PR body читать из `GITHUB_EVENT_PATH`;
- internal refactor вне mapped public behaviour не требует фиктивного docs diff;
- на `push` без PR context валидировать schema/paths + generation, но не требовать PR body;
- запускать внутри always-running CI chain;
- fail-closed validation: target существует/declared generated; required source glob не имеет accidental zero-match; mapping conflicts обнаруживаются; stale mapping ломает test.

### Критерии готовности
- [ ] Public behaviour/config/schema change требует docs review.
- [ ] Internal refactor не создаёт бессмысленный Markdown churn.
- [ ] Ownership targets валидны.
- [ ] Required globs не имеют silent zero-match.
- [ ] Mapping conflicts обнаруживаются.
- [ ] `reviewed-no-change` явный, с причиной.
- [ ] PR template содержит `Docs-Impact`; push-mode не требует PR metadata.
- [ ] Diff работает с фактической checkout/base strategy CI.
- [ ] Проверка не требует production secrets.

---

# DOC-11 — [P2] Prototype governance и glossary

### Цель
Отделить design approval от факта реализации и parity.

### Что необходимо сделать
Manifest v2:

```text
designStatus: draft | approved | retired
implementationStatus: unknown | not_implemented | partial | implemented
productionRoute: string | null
parityStatus: unknown | diverged | aligned
lastComparedAt: date | null
lastComparedSha: sha | null
knownDifferences: []
```

- Старый `approved` = только design approval.
- Непроверенное implementation/parity = `unknown`.
- Integrity test: unique id, prototype exists, valid enums; `aligned` требует date/SHA, `implemented` — production route.
- README prototypes фиксирует UX reference ≠ implementation authority.
- Добавить короткий glossary только для конфликтующих терминов: `mentor/curator/instructor`, learner, organization/workspace и т. п.
- Pixel-parity всех экранов не включать.

### Критерии готовности
- [ ] `approved` нельзя спутать с production implementation.
- [ ] Unknown хранится честно.
- [ ] Manifest проверяется CI.
- [ ] Терминологическая двусмысленность устранена без mass rewrite.

---

# DOC-12 — [P0 FINAL] Full integrity/freshness audit

### Цель
Доказать, что документация приведена в устойчивое конечное состояние.

### Что необходимо сделать
Выполнить финальный rebaseline и проверить все current docs против owner-sources:
- broken local links/paths — blocking CI;
- external HTTP links — periodic/non-blocking audit;
- current→archive authority references;
- `CURRENT` без owner;
- stale commands/scripts/env names;
- manual volatile inventories;
- duplicate active statuses/workflow rules;
- future PR numbering;
- evidence без snapshot context;
- stale README/navigation;
- secrets/production credentials.

Закрыть transitional artifacts:
- unique content `PROJECT_SOURCE_OF_TRUTH` распределён по governance/product/ADR → старый файл superseded/archive;
- `TODO_VERIFY` split завершён → mixed registry retired;
- старые trackers → archive;
- README ведёт в `docs/README.md`;
- `_meta/path-map.json` после link audit удалён либо архивирован как migration evidence;
- live branch ruleset/protection и required check names прочитаны заново;
- ни workflow, ни template, ни current planning-doc не требуют обновления archived `DEVELOPMENT_PLAN`.

Создать final evidence matrix:

```text
criterion → canonical owner/source → verification → result/evidence
```

Проверки:

```text
pnpm docs:consistency:test
pnpm docs:impact:test
pnpm docs:generate + clean diff
pnpm agent:preflight
релевантные lint/typecheck/tests/build
полный доступный GitHub CI
live ruleset/required-check read-back
```

Финальный audit report сохранить в `evidence/audits/`.

### Критерии готовности
- [ ] Нет известных current facts, противоречащих owner-sources.
- [ ] Нет current→archive authority dependency.
- [ ] Один AI workflow authority: `AGENTS.md`.
- [ ] Одна documentation map: `docs/README.md`.
- [ ] Один active-work owner: GitHub Issue.
- [ ] Volatile inventory generated/CI-enforced.
- [ ] Manual docs защищены impact review.
- [ ] History/evidence сохранены и изолированы.
- [ ] Temporary migration map закрыт.
- [ ] Archived `DEVELOPMENT_PLAN` не имеет current writable consumers.
- [ ] Для каждого критерия серии есть owner/source, verification и result.
- [ ] Все доступные checks зелёные; недоступные помечены `[НЕ ПРОВЕРЕНО]` с точной причиной.

## Целевая структура

```text
AGENTS.md
CLAUDE.md                    # thin adapter
docs/
├── README.md                # map/governance
├── _meta/
│   ├── ownership.json
│   └── path-map.json        # temporary until DOC-12
├── product/
│   └── future/
├── architecture/
│   └── adr/
├── contracts/
├── runbooks/
├── quality/
├── generated/
│   ├── API_INDEX.md
│   ├── RBAC.md
│   ├── MODULES.md
│   └── ENTITIES.md
├── status/
│   └── OPEN_DECISIONS.md
├── evidence/
│   ├── audits/
│   ├── production/
│   ├── performance/
│   ├── security/
│   ├── observability/
│   ├── smoke/
│   └── incidents/
├── archive/
│   ├── pre-implementation-master-context/
│   ├── development-ledger/
│   ├── old-trackers/
│   └── superseded/
└── lms-ui-prototypes-complete/
```

После DOC-12 `path-map.json` в current `_meta/` отсутствует: он удалён или находится только в archive/evidence.

## Зависимости и checkpoints

```text
DOC-01 → DOC-02 → DOC-03 → CHECKPOINT
       → DOC-04 → DOC-05 → DOC-06 → CHECKPOINT
       → DOC-07 → DOC-08 → DOC-09 → DOC-09.1 → DOC-10 → CHECKPOINT
       → DOC-11 → DOC-12
```

Checkpoint не создаёт отдельный PR по умолчанию. Он MUST подтвердить актуальный `main`, перечитать новые/изменённые relevant docs, проверить already-fixed/new findings и обновить execution scope оставшихся этапов.

Любое отклонение от линейной последовательности MUST иметь явное `depends_on` и доказательство отсутствия current/history/CI inconsistency.

## Definition of Done серии

- [ ] Один canonical owner для каждого volatile fact; snapshot/live state не выдаётся за вечную truth.
- [ ] Current / decision / evidence / history однозначно различаются.
- [ ] AI начинает с `AGENTS.md → docs/README.md → 1–3 task-specific sources`.
- [ ] API/RBAC/modules/entities не дрейфуют от кода.
- [ ] Public behaviour/config/schema не меняются без docs impact review.
- [ ] Active work не дублируется в Markdown trackers; canonical writable owner — GitHub Issue.
- [ ] `DEVELOPMENT_PLAN` — history и не имеет current writable consumers.
- [ ] PR/Issue templates используют новый work-item model; future GitHub PR numbers не резервируются.
- [ ] Security finding сохранён отдельным work item.
- [ ] Prototype design/implementation/parity разделены.
- [ ] Полезная история не удалена.
- [ ] Финальный current-doc audit не оставляет известных противоречий.
- [ ] Documentation integrity — обязательный CI gate через always-running required-check chain.
- [ ] Runtime OpenAPI + controllers остаются API authority; generated API — compact derived index.
- [ ] Temporary migration artifacts закрыты к DOC-12.
- [ ] Перед каждым этапом выполнен task-scoped rebaseline.

## Внешняя проверка инженерных решений

Внешние предпосылки повторно проверены при подготовке v3; они объясняют решения, но не заменяют owner-sources репозитория:

- **GitHub Docs — required status checks:** required workflow, пропущенный через `paths`/branch filter, может остаться `Pending`; docs checks поэтому входят в always-running required chain.
- **GitHub Docs — issue/PR templates:** templates стандартизируют входные данные. Issue Forms на момент проверки всё ещё public preview, поэтому базовый план использует минимальный Markdown template, если rebaseline не докажет пользу формы.
- **Diátaxis:** tutorial, how-to, reference и explanation используются как ось purpose отдельно от lifecycle.
- **OpenAPI Specification:** актуальная опубликованная OAS на момент проверки — 3.2.0; в проекте API authority определяется runtime OpenAPI + controllers.
- **Write the Docs — Docs as Code:** Git, issue tracker, code review и automated tests соответствуют выбранному CI/ownership/impact подходу.

Источники:
- https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks
- https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates
- https://diataxis.fr/
- https://spec.openapis.org/oas/latest.html
- https://www.writethedocs.org/guide/docs-as-code/
- https://www.writethedocs.org/guide/tools/testing/

## Антирегрессия

```text
before each DOC stage
        → current main
        → task-scoped owner-source rebaseline
        → update stage scope

API/role/module/entity change
        → generate
        → CI clean-diff

public behaviour/config/operation change
        → ownership map
        → docs update OR explicit reviewed-no-change

audit/smoke/verification
        → evidence/

old knowledge
        → archive/
        → NEVER current authority
```
