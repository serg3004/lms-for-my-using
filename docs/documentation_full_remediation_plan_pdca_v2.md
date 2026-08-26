# План полной реорганизации документации LMS

> **Проверенная база после 3×PDCA:** `main` = `f35498cf0af010103e27c2f98b547553e3c1a7ca` (PR #702, 2026-08-26).
> `PR 1…12` — порядок выполнения, не будущие номера GitHub PR.
> `DONE` всей задачи разрешён только после PR 12.

## Основание

[ФАКТ] Повторная сверка трёх предыдущих выводов с current `main` подтвердила:

- `docs/README.md` отсутствует; в `AGENTS.md` нет documentation governance.
- `docs/` смешивает current docs, ADR, plans/status, audits/evidence и history.
- 23 файла `master-context` остаются рядом с current docs и содержат старый AI/canonical context.
- `PROJECT_SOURCE_OF_TRUTH`, `MVP_SCOPE_LOCK`, `TODO_VERIFY`, README и API docs содержат stale facts.
- Current code: 5 ролей с `mentor`, `NotificationsModule`/`Notification`, `GET /courses/summary`, рабочий password reset.
- Production evidence подтверждает `prisma migrate deploy`, что конфликтует с README.
- `docs:consistency:test` существует, но основной CI его не запускает.
- `DEVELOPMENT_PLAN.md` ≈376 KB и >4500 строк; PR #702 снова потребовался только для ремонта рассинхронизированных сводных статусов внутри этого ledger.
- Legacy manual OpenAPI уже `@deprecated`; current authority — runtime `/api/v1/api-json`.
- PR #701 добавил полноценный Admin Audit Log (`AuditLogModule`, API/UI); `API_CONTRACTS.md` всё ещё утверждает, что dedicated audit-log отсутствует.
- `.github/pull_request_template.md` всё ещё требует `Plan PR` из `DEVELOPMENT_PLAN.md`; после архивирования ledger этот шаблон сам станет источником старого workflow.
- В `.github/` нет `ISSUE_TEMPLATE`; перенос active backlog в GitHub Issues без минимального шаблона оставит новый источник работы неструктурированным.
- `CLAUDE.md` конфликтует с `AGENTS.md`; prototype manifest смешивает design/implementation/parity.
- Подтверждённый group-manager authorization finding всё ещё существует и не должен потеряться при архивировании планов.
- Current Git tree содержит 4 workflow YAML, Actions API показывает 8 records: live GitHub state нельзя хранить как вечный Markdown inventory.

## Результат трёх PDCA-циклов

| Цикл | Проверка | Найдено | Коррекция |
|---|---|---|---|
| PDCA 1 | внутренняя логика плана + GitHub templates | PR template зависит от `DEVELOPMENT_PLAN`; не было path migration map | дополнить PR 7/8/10 |
| PDCA 2 | новый `main`, история и current code/docs | база сменилась; появился Audit Log, docs уже отстали; PR #702 чинит сам ledger | обновить baseline и PR 2 |
| PDCA 3 | GitHub Docs, Diátaxis, OpenAPI, Docs as Code | purpose ≠ lifecycle; required workflow нельзя безопасно path-filter; full OpenAPI copy избыточна | уточнить PR 1/3/9/10/12 |

**Не подтверждено как необходимость:** отдельный PR для CODEOWNERS, новый documentation framework, обязательный внешний link-check в каждом PR, новые зависимости. В текущем solo/user-owned репозитории это добавило бы сложность без доказанной отдачи.

## Границы

Входит: governance, factual reconciliation, taxonomy, archive/evidence, AI context, active-work ownership, generated docs, CI integrity, prototypes.

Не входит: product behaviour, production changes и исправление security-кода. Security finding получает отдельный work item.

## Схема доверия

```text
AGENTS.md
   ↓
docs/README.md  ← карта, taxonomy, ownership
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

| Факт | Owner |
|---|---|
| DB entities/enums | Prisma schema |
| Permissions/RBAC | `roles.ts` + guards |
| API surface | runtime OpenAPI + controllers |
| Nest modules | `AppModule` |
| Product/MVP scope | `docs/product/` |
| Architecture rationale | ADR |
| Behaviour semantics | contracts |
| Operations | runbooks |
| Live state | dated evidence |
| Active implementation work | GitHub Issues/Project |
| Business/owner decisions | `status/OPEN_DECISIONS.md` |
| Old design/history | archive |
| UI design reference | prototypes + manifest |

## Lifecycle

```text
contract/decision/runbook: DRAFT → CURRENT → SUPERSEDED → ARCHIVE
evidence:                 OBSERVED(date/SHA/env) → immutable snapshot
generated:                SOURCE → GENERATE → CI clean-diff
work:                     OPEN → Issue/Project → DONE
```

## Общие правила серии

- Каждый PR начинается от актуального `main`; уже исправленное повторно не менять.
- Mass `git mv` и semantic rewrite не смешивать без необходимости.
- Historical/evidence сохранять; не «осовременивать» историю.
- После PR 3 обязательны docs checks + `agent:preflight` + релевантный CI.
- Не добавлять dependency, если достаточно текущего Node/tooling.

---

# PR 1 — [P0] Documentation governance

### Цель
Дать человеку и ИИ единый короткий ответ: что читать, чему доверять и куда класть новый документ.

### Что необходимо сделать
- Создать `docs/README.md`: precedence, ownership и **две независимые оси**:
  - назначение: decision/explanation, contract/reference, runbook/how-to, tutorial/onboarding — только если реально нужен;
  - lifecycle: draft/current/superseded/evidence/historical.
- Не смешивать назначение и lifecycle: например ADR может быть `current` или `superseded`, evidence — отдельный snapshot-class.
- Добавить в `AGENTS.md` ≤30 строк Documentation Rules:
  - читать только task-relevant docs;
  - current fact проверять по owner-source;
  - behaviour/API/config/schema change → docs review в том же PR;
  - archive/evidence не использовать как current authority;
  - не создавать ручной inventory, если факт выводится из кода.
- Не помещать в `AGENTS.md` роли/endpoints/topology.
- SHA обязателен для snapshot/evidence, но не как глобальная «печать актуальности» mutable contract.

### Критерии готовности
- [ ] Для каждого типа информации указан owner.
- [ ] `docs/README.md` — единственная documentation map.
- [ ] `AGENTS.md` задаёт процесс, не копирует domain knowledge.
- [ ] Нет массовых moves/rewrite.

---

# PR 2 — [P0] Reconcile current truth

### Цель
Удалить подтверждённые противоречия из entry-point/CURRENT docs до реорганизации путей.

### Что необходимо сделать
Перепроверить current `main` и синхронизировать `README`, `PROJECT_SOURCE_OF_TRUTH`, `MVP_SCOPE_LOCK`, `TODO_VERIFY`, `MVP_DEFINITION_OF_DONE`, `API_CONTRACTS` и связанные status docs:

- roles → `mentor` учитывается;
- Notifications → отражать реальное implementation state;
- migrations → не отрицать подтверждённый production `migrate deploy`;
- password-reset `503` → только historical context;
- route inventory → runtime OpenAPI authority, включая `/courses/summary`;
- Audit Log → сверить новый `AuditLogModule`, Prisma/model, admin API/UI и runtime OpenAPI с API/security/MVP/status docs; удалить claim «dedicated audit-log отсутствует»;
- GitHub protection/workflows → `LIVE-VERIFY`, без вечных Boolean/inventory claims.

`PROJECT_SOURCE_OF_TRUTH` оставить только как transitional decisions/precedence index; volatile inventories убрать. В MVP docs разделить scope decision и implementation.

### Критерии готовности
- [ ] Entry-point/CURRENT docs не противоречат проверенным owner-sources.
- [ ] Decision / implementation / live observation разделены.
- [ ] Historical facts явно historical.
- [ ] Ничего не исправлено «по памяти».

---

# PR 3 — [P0] Docs consistency как CI gate

### Цель
Остановить новый drift до массовых moves.

### Что необходимо сделать
- Включить `pnpm docs:consistency:test` в **всегда запускаемый** основной `ci.yml`, лучше внутри `quality`, чтобы failure транзитивно падал в итоговый required `Checks`.
- Не создавать отдельный required docs-workflow с `paths`/branch filters: skipped required workflow может остаться `Pending` и заблокировать merge.
- Сохранить existing checks `AppModule↔modules` и `CourseAccessGuard↔RBAC`.
- Добавить проверки существования локальных путей/ссылок из `docs/README.md` и current entry points.
- Archive/evidence исключить из current-code equivalence checks.
- Проверить repository branch-protection policy tests; live ruleset read-back оставить финальному audit, а не делать docs CI зависимым от admin token.

### Критерии готовности
- [ ] Docs test реально выполняется в PR CI.
- [ ] Нарушение tested invariant ломает CI.
- [ ] History не ломается из-за эволюции current code.
- [ ] Existing CI не ослаблен; docs failure достигает итогового `Checks`.
- [ ] Required docs check не зависит от workflow-level `paths` filter.

---

# PR 4 — [P0] Единые AI entry points

### Цель
Сделать `AGENTS.md` единственным общим workflow authority.

### Что необходимо сделать
- `CLAUDE.md` → thin adapter к `AGENTS.md` + `docs/README.md`; оставить только Claude-specific правила.
- Убрать из него конфликтующие branch/PR инструкции, Windows paths, volatile URL/demo context.
- Полную старую версию `AI_AGENT_STARTER_PROMPT` сохранить в archive; active starter заменить коротким:
  `AGENTS.md → docs/README.md → task-specific sources`.
- Удалить stale private-repo/framework/ORM/storage/role claims и неверные root paths.
- `.claude/settings.json` оставить config, не workflow authority.
- CI проверяет links всех active agent entry points.

### Критерии готовности
- [ ] Общие правила AI существуют только в `AGENTS.md`.
- [ ] Active AI docs не отправляют в history как authority.
- [ ] Нет machine-specific/volatile context в provider adapter.
- [ ] Agent links проходят CI.

---

# PR 5 — [P0] Archive pre-implementation context

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

# PR 6 — [P1] Evidence отдельно от contracts/runbooks

### Цель
Разделить нормативное знание и доказательство конкретной проверки.

### Что необходимо сделать
Создать `evidence/{audits,production,performance,security,observability,smoke,incidents}/` и через `git mv` перенести по смыслу:

- `PR*_VERIFICATION*`;
- security/documentation/CI/dead-code/frontend/performance audits;
- staging/production smoke snapshots;
- incident tabletop;
- другие dated verification/status reports.

Stable incident/backup/SLO procedures оставить runbooks. Evidence хранит `observed_at`, а SHA/environment — только когда известны и релевантны.

### Критерии готовности
- [ ] Audit/verification snapshot не лежит среди current contracts.
- [ ] Runbook ≠ execution result.
- [ ] Evidence не переписывает прошлое.
- [ ] Все ссылки сохранены.

---

# PR 7 — [P1] Current taxonomy через `git mv`

### Цель
Сделать тип current-документа понятным по пути и уменьшить AI reading scope.

### Что необходимо сделать
Создать: `product/`, `product/future/`, `architecture/adr/`, `contracts/`, `runbooks/`, `quality/`, `status/`, `generated/`, `_meta/`.

| Current | Target |
|---|---|
| `ADR_*` | `architecture/adr/` |
| architecture/CSS docs | `architecture/` |
| auth/checklist/instructor/API/storage semantics | `contracts/` |
| MVP scope | `product/` |
| unimplemented entity ideas | `product/future/` |
| local/deploy/migration/pilot/release procedures | `runbooks/` |
| accessibility/dependency/security quality policies | `quality/` |

- `ENTITY_TECHSPEC_IMPLEMENTED` оставить human semantics; inventory уберёт PR 9.
- Prototype package не двигать: отдельный каталог уже понятен.
- Создать компактный `_meta/path-map.json` (`oldPath → newPath`) на время/после миграции: он нужен для аудита ссылок и поиска файлов по старым PR/документам.
- Обновить links/scripts/tests/CI paths по path-map.
- Content не переписывать вместе с mass moves.

### Критерии готовности
- [ ] Назначение current doc видно из пути.
- [ ] Root `docs/` больше не склад разнотипных Markdown.
- [ ] Scripts/tests используют новые paths.
- [ ] Для каждого перемещённого current-файла есть проверяемое old→new соответствие.
- [ ] Docs/link checks проходят.

---

# PR 8 — [P1] Один active backlog и frozen development ledger

### Цель
Прекратить конкурирующие статусы и append-only `DEVELOPMENT_PLAN`.

### Что необходимо сделать
- `DEVELOPMENT_PLAN.md` → immutable `archive/development-ledger/`.
- Canonical active implementation work → GitHub Issues/Project.
- `status/OPEN_DECISIONS.md` → только owner/business decisions.
- Свести open items из `TODO_VERIFY`, `CONCERNS`, `RECOMMENDATIONS`, hardening backlog, frontend roadmap, org plan, branch-protection future work.
- Для каждого open item создать/связать один canonical destination; сохранить mapping `old id → issue/decision`, затем old trackers → archive.
- Не резервировать будущие PR numbers; использовать Issue ID или stable `SEC/ORG/DOC-*`.
- Обновить `.github/pull_request_template.md`: удалить `Plan PR`/ссылку на `DEVELOPMENT_PLAN`; заменить на `Work item: #issue | stable-id | N/A`.
- Добавить один минимальный `.github/ISSUE_TEMPLATE/work-item.md` (или YAML form только если осознанно выбран preview): цель, scope, критерии готовности, риск/rollback, docs impact. Не строить сложную label-систему.
- Создать отдельный work item для подтверждённого manager/group object-scope security finding; код не менять.
- Проверить current scripts/workflows: ничто в current tree не должно append archived ledger.
- Actions records, которых нет в current Git tree, считать live/platform verification, а не доказательством наличия YAML.

### Критерии готовности
- [ ] У active task один writable owner.
- [ ] Feature PR больше не обновляет development ledger.
- [ ] Все open items имеют mapping.
- [ ] Security finding не потерян.
- [ ] Нет repo automation, пишущей в archived ledger.
- [ ] Нет future-task IDs вида «PR 271».
- [ ] PR template больше не зависит от archived `DEVELOPMENT_PLAN`.
- [ ] Для нового canonical backlog существует минимальный структурированный work-item template.

---

# PR 9 — [P1] Generated volatile inventories

### Цель
Исключить тихий drift API/RBAC/modules/entities.

### Что необходимо сделать
Добавить deterministic `docs:generate`:

- `generated/RBAC.md` ← `rolePolicies`/guards;
- `generated/MODULES.md` ← `AppModule`;
- `generated/ENTITIES.md` ← Prisma;
- `generated/API_INDEX.md` ← runtime OpenAPI metadata **только как компактный method/path/tag/auth index**.

Дополнительно:

- role existence consistency проверять между источниками, где оно обязано совпадать; permissions принадлежат `roles.ts`;
- current API authority = runtime `/api/v1/api-json`; не коммитить вторую полную копию OpenAPI/DTO как новый Source of Truth;
- генератор API должен получать документ из текущего `createOpenApiDocument`/test bootstrap без обращения к production URL;
- `generated/` исключить из default AI reading path: читать только по API/RBAC/schema задаче;
- deprecated manual OpenAPI не использовать как authority;
- legacy public endpoint не удалять без отдельного compatibility decision;
- human API/RBAC/module/entity docs оставить для conventions/invariants/boundaries/rationale;
- заменить хрупкий regex-parsing там, где существующий project/runtime API позволяет получить данные надёжнее; новые parser dependencies не добавлять без необходимости;
- CI: generate → clean diff.

### Критерии готовности
- [ ] Route/permission/module/entity change не может тихо оставить docs stale.
- [ ] Generation идемпотентна.
- [ ] Generated API — компактный index, а не дубликат полного OpenAPI/DTO.
- [ ] Human semantics/rationale сохранены.
- [ ] Public compatibility не нарушена.
- [ ] Новые dependencies не добавлены без необходимости.

---

# PR 10 — [P1] Source→docs impact enforcement

### Цель
Защитить manual contracts/runbooks, которые нельзя полностью генерировать.

### Что необходимо сделать
Создать `_meta/ownership.json` для **публично значимых** source globs:

```text
Prisma schema              → data contracts + generated entities
auth/roles/guards          → auth/RBAC
controllers/API metadata   → generated API
env/config examples        → deploy/config docs
migration/deploy scripts   → migration/deploy runbooks
security/release workflow  → quality/release docs
```

Добавить `docs:impact:test`:

- на PR вычисляет changed mapped sources через `git diff` по base/head SHA из GitHub event, без GitHub API;
- generated targets проверяет автоматически;
- manual owner-doc либо изменён, либо PR содержит `Docs-Impact: reviewed-no-change — <причина>`;
- обновить `.github/pull_request_template.md`, добавив короткое поле `Docs-Impact`;
- PR body читать из `GITHUB_EVENT_PATH`, а не отдельным API-запросом;
- internal refactor вне mapped public behaviour не требует фиктивного docs diff;
- на `push` без PR context валидировать ownership schema/paths + generation, но не требовать отсутствующий PR body;
- запускать это внутри always-running CI, а не отдельного required workflow с `paths` filters.

### Критерии готовности
- [ ] Public behaviour/config/schema change требует docs review.
- [ ] Internal refactor не создаёт бессмысленный Markdown churn.
- [ ] Все ownership paths существуют.
- [ ] `reviewed-no-change` явный, а не молчаливый.
- [ ] PR template содержит `Docs-Impact`, а push-mode не требует PR metadata.
- [ ] Проверка не требует production secrets.

---

# PR 11 — [P2] Prototype governance и glossary

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
- Непроверенное implementation/parity = `unknown`, не предположение.
- Integrity test: unique id, prototype exists, valid enums; `aligned` требует date/SHA, `implemented` — production route.
- README prototypes явно фиксирует UX reference ≠ implementation authority.
- Добавить короткий glossary только для конфликтующих терминов: `mentor/curator/instructor`, learner, organization/workspace и т. п.
- Pixel-parity всех экранов в этот PR не включать.

### Критерии готовности
- [ ] `approved` нельзя спутать с production implementation.
- [ ] Unknown хранится честно.
- [ ] Manifest проверяется CI.
- [ ] Терминологическая двусмысленность устранена без mass rewrite.

---

# PR 12 — [P0 FINAL] Full integrity/freshness audit

### Цель
Доказать, что система документации действительно приведена в конечное устойчивое состояние.

### Что необходимо сделать
Повторно проверить **все current docs** против owner-sources и найти:

- broken local links/paths — blocking CI;
- external HTTP links — отдельный periodic/non-blocking audit, чтобы transient third-party/network failure не блокировал обычный merge;
- current→archive authority references;
- `CURRENT` без owner;
- stale commands/scripts/env names;
- оставшиеся manual volatile inventories;
- duplicate active statuses;
- duplicated AI workflow rules;
- future PR numbering;
- evidence без snapshot context;
- stale README/navigation;
- secrets/production credentials.

Закрыть transitional artifacts:

- unique content `PROJECT_SOURCE_OF_TRUTH` распределён по governance/product/ADR → старый файл superseded/archive;
- `TODO_VERIFY` split завершён → mixed registry retired;
- старые trackers → archive;
- README ведёт в `docs/README.md`.
- Проверить live `Protect main` ruleset/read-back и фактические required check names; repository policy и GitHub state должны совпадать.

Проверки:

```text
pnpm docs:consistency:test
pnpm docs:impact:test
pnpm docs:generate + clean diff
pnpm agent:preflight
релевантные lint/typecheck/tests/build
полный доступный GitHub CI
```

Финальный audit report сохранить в `evidence/audits/`, а не создавать новый Source of Truth.

### Критерии готовности
- [ ] Нет известных current facts, противоречащих owner-sources.
- [ ] Нет current→archive authority dependency.
- [ ] Один AI workflow authority: `AGENTS.md`.
- [ ] Одна documentation map: `docs/README.md`.
- [ ] Один active-work owner: GitHub Issues/Project.
- [ ] Volatile inventory generated/CI-enforced.
- [ ] Manual docs защищены impact review.
- [ ] History/evidence сохранены и изолированы.
- [ ] Все checks зелёные либо явно `[НЕ ПРОВЕРЕНО]` с причиной.

---

## Целевая структура

```text
AGENTS.md
CLAUDE.md                    # thin adapter
docs/
├── README.md                # map/governance
├── _meta/
│   ├── ownership.json
│   └── path-map.json
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

## Зависимости

```text
PR1 → PR2 → PR3 → PR4 → PR5 → PR6
                         ↓
PR7 → PR8 → PR9 → PR10 → PR11 → PR12
```

Последовательность намеренная: **правила → исправление фактов → CI → AI context → history/evidence → paths → planning → generation → impact → prototypes → final audit**.

## Definition of Done серии

- [ ] Один owner для каждого volatile fact.
- [ ] Current / decision / evidence / history однозначно различаются.
- [ ] AI начинает с `AGENTS.md → docs/README.md → 1–3 task-specific sources`, а не читает весь `docs/`.
- [ ] API/RBAC/modules/entities не дрейфуют от кода.
- [ ] Public behaviour/config/schema не меняются без docs impact review.
- [ ] Active work не дублируется в Markdown trackers.
- [ ] `DEVELOPMENT_PLAN` — history, не рабочая БД статусов.
- [ ] PR template и Issue template используют новый work-item model, а не `Plan PR` из ledger.
- [ ] Security finding сохранён отдельным work item.
- [ ] Prototype design/implementation/parity разделены.
- [ ] Полезная история не удалена.
- [ ] Финальный current-doc audit не оставляет известных противоречий.
- [ ] Documentation integrity — обязательный CI gate через always-running required-check chain.
- [ ] Runtime OpenAPI остаётся API authority; committed generated API остаётся компактным index.


## Внешняя проверка инженерных решений

План дополнительно сверён с внешними источниками:

- **GitHub Docs — required status checks:** required workflow, пропущенный через `paths`/branch filter, может остаться `Pending` и заблокировать merge. Поэтому docs checks интегрируются в always-running `ci.yml`, а не в отдельный path-filtered required workflow.
- **GitHub Docs — issue/PR templates:** PR template автоматически попадает в body PR; issue templates/forms стандартизируют входные данные. Поэтому `Work item` и `Docs-Impact` должны жить в PR template, а новый Issue backlog получает минимальный шаблон.
- **Diátaxis:** различает tutorial, how-to, reference и explanation. В этом плане это используется как ось **назначения**, отдельно от lifecycle `current/evidence/historical`.
- **OpenAPI Specification:** OAS предназначена как машинно- и человекочитаемое описание HTTP API. Поэтому runtime OpenAPI остаётся API authority, а Markdown хранит только компактный index и человеческие semantics.
- **Write the Docs — Docs as Code:** рекомендует Git, issue tracker, code review и automated tests для документации; link testing — базовая автоматизируемая проверка. Это соответствует CI/ownership/impact подходу плана.

Источники:
- https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks
- https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates
- https://diataxis.fr/
- https://spec.openapis.org/oas/latest.html
- https://www.writethedocs.org/guide/docs-as-code/
- https://www.writethedocs.org/guide/tools/testing/

## Антирегрессия

```text
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
