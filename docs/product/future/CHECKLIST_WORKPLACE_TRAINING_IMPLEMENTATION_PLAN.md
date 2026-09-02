# План реализации: Чек-лист — обучение на рабочем месте

**Основание:** прототип `CHECKLIST_WORKPLACE_TRAINING_PROTOTYPE_V3.html` (лежит в этой же папке) и проверенные контракты репозитория.
**Статус:** план готов к реализации, начиная с PR 285.
**Цель:** это **не новый модуль**. Это расширение существующего модуля `Checklist` (`apps/api/src/modules/checklists/`, frontend `AdminChecklistsPage` и nav-item `admin.nav.checklists`) новым режимом «сессия наблюдения на рабочем месте» — со своим backend-контрактом и полным production UI, а не только backend.

## 0. Модуль и границы — обязательно к соблюдению

- **Module boundary не создаётся.** Весь backend-код живёт в `apps/api/src/modules/checklists/` (или в новых файлах внутри этой же папки), НЕ в `apps/api/src/modules/workplace-training/` и ни в каком другом новом каталоге модуля. `architecture:check` (`scripts/check-module-boundaries.mjs`) не должен увидеть новый module boundary.
- **Prisma-имена — семейство `Checklist*`, не `WorkplaceTraining*`.** Ниже точный список (см. PR 288).
- **`Session` — это overlay 1:1 над существующей `ChecklistInstance`, а не копия.** `ChecklistInstance` уже хранит `totalScore/maxScore/percentage/passed/templateSnapshot/snapshotVersion/status/dueAt/submittedAt/completedAt`. Новая таблица `ChecklistSession` добавляет только то, чего в `ChecklistInstance` нет: `scheduledAt/startedAt/pausedAt/observerId/locationCapturePolicy/timezone` и т.п., через `@relation` на `ChecklistInstance` (1:1, `onDelete: Cascade`). Scoring/skip-логика (PR 291) пишет результат в существующие поля `ChecklistInstance`/`ChecklistItemResult`, не создаёт параллельные.
- **Существующие сервисы расширяются, не дублируются:**
  - `ChecklistReviewAccessService` (`apps/api/src/modules/checklists/checklist-review-access.service.ts`) уже даёт manager-scoped доступ к чужим `ChecklistInstance` через `ManagerTeamScope`. Object-scope для Observer/Manager (PR 287) расширяет этот сервис (и переводит его на `OrganizationAccessScopeService` — см. ниже), а не создаёт `WorkplaceTrainingAccessService`.
  - `OrganizationAccessScopeService` (`apps/api/src/modules/organization-access-scope/`, PR 278–279) — уже единый источник "эффективная команда менеджера" (Group ∪ Department DIRECT ∪ ReportingLine DIRECT, транзитивно). Manager Dashboard (PR 299) и `ChecklistReviewAccessService` используют именно его, а не голый `ManagerTeamScope`.
  - `ChecklistDeadlineWorker`/`checklist-deadlines.ts` (`apps/api/src/modules/checklists/`) — уже реализованный recurring job через `BackgroundJobsService.registerHandler/registerRecurring` для просроченных `ChecklistInstance`. Новый `ChecklistSessionReminderWorker` (PR 290) регистрируется по тому же паттерну как сосед этого файла, не изобретает работу с очередью заново.
  - `ChecklistItemResult.photoUrl/photoObjectKey/photoFileName/photoMimeType/photoSizeBytes` — фото-доказательства уже реализованы. PR 288/289 переиспользуют эти же колонки для session-критериев, не создают отдельный `ChecklistEvidence`, если только не понадобится хранить несколько фото на критерий (см. открытый вопрос в PR 289).
  - `Checklist.scaleLevels` (Json) — существующий ad-hoc способ задать шкалу на конкретном чек-листе. PR 293 (шкалы) вводит tenant-scoped переиспользуемую `ChecklistScale`, но это **не убирает и не ломает** `scaleLevels` для обычных (не session) чек-листов — оба механизма сосуществуют, `scaleLevels` не мигрируется автоматически.
- **RBAC:** роль Observer = существующая роль `instructor` (custom-роли — `OUT-OF-MVP` по `docs/product/MVP_SCOPE_LOCK.md`). Роль Manager/Admin/Employee = существующие `manager`/`admin`/`learner`. Никакая новая роль не создаётся.
- **`docs/_meta/ownership.json`**: новая мапа `workplace-training` не заводится. Изменения в `checklists.controller.ts`/`roles.ts`/`schema.prisma`/`app.module.ts` покрываются уже существующими mapping-ами `api-surface`/`auth-rbac`/`data-model`/`module-topology`.

## 0.1. Прототип и то, как с ним работать

Прототип — `CHECKLIST_WORKPLACE_TRAINING_PROTOTYPE_V3.html`, лежит в этой же папке `docs/product/future/`, **не в** `docs/lms-ui-prototypes-complete/`. Это намеренно:

- Он остаётся **единым файлом на 7 экранов/ролей**, не разбивается на отдельные HTML-файлы по образцу `docs/lms-ui-prototypes-complete/` (`1 файл = 1 экран`). Та конвенция и её manifest/governance (`docs/lms-ui-prototypes-complete/manifest.json`, `scripts/prototype-governance.test.mjs`) здесь **не применяются и не должны применяться** — файл сознательно не регистрируется в этом манифесте.
- Каждый `PR 29X`, реализующий конкретный экран, сверяется с соответствующей секцией внутри этого одного файла (`<section id="sessions|builder|observer|employee|manager|report">`, модалка `#wizardModal`) — не создавайте и не ожидайте отдельного prototype-файла на экран.
- **Production-роутинг обязан следовать таблице ниже, а не собственной декомпозиции по сущностям.** Это главный урок из модуля «Оргструктура» (PR 266–279): там каждая новая backend-сущность (Department/Position/PositionCourse/DepartmentManager/ReportingLine) закономерно получила свой отдельный top-level route и свой пункт меню — 1 файл/сущность = 1 экран/пункт меню. Для этого модуля так делать **нельзя**.

### Таблица маршрутов (production routing contract)

| Экран прототипа | Роль | Существующая точка расширения | Новый route/пункт меню |
|---|---|---|---|
| ▣ Сессии | admin | `admin.nav.checklists` → `/admin/checklists` (`AdminChecklistsPage`) | вкладка/под-маршрут `/admin/checklists/sessions`, **не новый nav-item** |
| ＋ Создать сессию | admin | тот же `/admin/checklists` | модалка (как в прототипе — `#wizardModal`), не отдельная страница |
| ☑ Листы наблюдения | admin | тот же `/admin/checklists` | под-маршрут `/admin/checklists/observation-sheets/:id/builder` |
| ◉ Проведение | observer (= `instructor`) | `/instructor/checklists` (`InstructorChecklistReviewsPage`) | расширение этой же страницы/её под-маршрут `/instructor/checklists/sessions/:id`, **не новая роль и не новый top-level route** |
| ♙ Мои сессии | employee (= `learner`) | `/learn/checklists` (`LearnerChecklistsPage`) | расширение этой же страницы, новый nav-item не создаётся |
| ◔ Панель руководителя | manager | плоское меню `/manager/dashboard, /manager/team, /manager/overdue, /manager/reports` (`managerLayout.tsx`) | **ровно один** новый пункт `/manager/checklists` — пропорционально существующему плоскому меню, это не фрагментация |
| ▤ Отчёт | admin | — | вложенный экран `/admin/checklists/sessions/:id`, открывается drill-down, отдельного nav-item нет |

Итог: **максимум один новый пункт меню за весь модуль** (`/manager/checklists`). Всё остальное — новые вкладки/под-маршруты внутри уже существующих разделов Checklist в каждой роли.

## 0.2. Visual Product Contract

Прототип — основной UX/UI reference: навигация, композиция, плотность, иерархия, wizard, mobile observer, manager dashboard и report.

Визуальные правила:
- переиспользовать shell/sidebar/header, buttons, forms, tables, badges, dialogs и typography проекта;
- не создавать параллельный design system;
- desktop-first для admin/manager;
- mobile-first для observer;
- employee flow responsive;
- status presentation едина с существующими статусами `ChecklistInstance`;
- accessibility и visual regression входят в DoD;
- frontend visibility не заменяет backend authorization;
- settings, шкалы, diagnostics и revision details раскрываются контекстно, а не перегружают основную навигацию;
- технические термины backend (`ManagerTeamScope`, `OrganizationAccessScopeService`, `snapshotVersion`, `idempotencyKey`, `P2034`, `denominator`, `worker`) не показываются в основном UI.

---

## PR 285 — Архитектурные и продуктовые контракты

**Цель:** закрыть неоднозначности до runtime-кода.

**Зависимости:** нет.

**Что необходимо сделать:**
- зафиксировать в коде/ADR решение "PR 0" выше: `ChecklistSession` — overlay 1:1 над `ChecklistInstance`, никакого нового module boundary;
- зафиксировать Observer = роль `instructor`;
- state machine для `ChecklistSession` (см. PR 286);
- scoring algorithm v1 (расширение существующей percentage-логики `ChecklistInstance`, не новый алгоритм с нуля);
- safe defaults: manager-as-observer, feedback visibility, module enablement, thresholds, geolocation, email;
- API/RBAC contracts;
- ownership сущностей.

**Критерии готовности:**
- [ ] решение "Session = overlay ChecklistInstance" задокументировано и не имеет альтернативных трактовок;
- [ ] Observer однозначно = `instructor`;
- [ ] state machine и scoring однозначны;
- [ ] role/object policies определены;
- [ ] нет циклической зависимости;
- [ ] unresolved decisions имеют safe defaults.

## PR 286 — Organization-level настройки

**Цель:** tenant-scoped управление режимом session у Checklist-модуля.

**Зависимости:** PR 285.

**Что необходимо сделать:**
- переиспользовать существующий config/feature mechanism;
- при отсутствии добавить минимальную конфигурацию (`ChecklistWorkplaceSettings`, tenant-scoped);
- moduleEnabled=false по умолчанию;
- highPerformanceThreshold=90 по умолчанию;
- critical/low threshold — только после product/owner decision, не включать молча;
- defaultGeolocationPolicy;
- feedbackVisibility;
- server-side enforcement.

**Критерии готовности:**
- [ ] настройки tenant-scoped;
- [ ] safe defaults существуют;
- [ ] frontend не источник истины;
- [ ] настройки покрыты тестами.

## PR 287 — Object-level authorization

**Цель:** исключить IDOR/cross-tenant доступ, переиспользуя, а не дублируя существующий access-слой.

**Зависимости:** PR 285.

**Что необходимо сделать:**
- расширить `ChecklistReviewAccessService`: перевести его внутреннюю зависимость с `ManagerTeamScope` на `OrganizationAccessScopeService` (Group ∪ Department DIRECT ∪ ReportingLine DIRECT), добавить observer assignment и employee self-scope для `ChecklistSession`;
- admin organization scope (tenant-wide, без изменений);
- inherited nested-resource access (evidence/location через `ChecklistSession`/`ChecklistInstance`);
- server-side list/analytics filtering.

**Критерии готовности:**
- [ ] `ChecklistReviewAccessService` использует `OrganizationAccessScopeService`, не сырой `ManagerTeamScope`;
- [ ] manager не видит employee вне scope (Group/Department/ReportingLine union);
- [ ] observer не проводит чужую session;
- [ ] employee видит только свои sessions;
- [ ] nested UUID не обходит authorization;
- [ ] negative access tests покрывают endpoint families;
- [ ] существующие Checklist review-access тесты не регрессируют.

## PR 288 — Prisma domain model и migrations

**Цель:** persistence нового режима внутри Checklist-домена.

**Зависимости:** PR 285, PR 287.

**Что необходимо сделать (имена — семейство `Checklist*`, дополняют, не заменяют существующие модели):**
- `ChecklistSession` — 1:1 overlay над `ChecklistInstance` (`instanceId` unique FK), поля: `scheduledAt`, `startedAt`, `pausedAt`, `observerId`, `locationCapturePolicy`, `timezone`, `status` (session-specific lifecycle, см. PR 286/289: `scheduled/in_progress/paused/completed/cancelled` — отдельно от `ChecklistInstance.status`, который остаётся про сдачу/ревью);
- `ChecklistScale` + `ChecklistScaleLevel` (ordered levels) — не заменяет `Checklist.scaleLevels`, сосуществует;
- расширение `ChecklistItem`/`Checklist` per-item-config полями `weight`, `allowSkip`, `autoSkipUnanswered` (проверить, не покрыто ли уже существующими `isRequired`/`photoRequired` частично, прежде чем добавлять новые);
- `ChecklistSessionEvent` — append-only, по образцу `ChecklistInstanceEvent`;
- `ChecklistScoreRevision` — по образцу существующего revision/audit паттерна (`OrgStructureEvent`, `AuditLog`);
- `ChecklistSessionReminder` — persistent ledger, по образцу `ChecklistInstanceEvent`/`checklist-deadlines.ts`;
- `ChecklistLocationCapture` — новая таблица (в текущей схеме геолокации ни у чего нет), start/end only;
- lifecycle/event enums, snapshot/version/scoring fields, tenant indexes;
- additive migration, raw SQL для любых partial unique index по паттерну `department_managers`/`reporting_lines`.

**Критерии готовности:**
- [ ] ни одно новое поле не дублирует существующее поле `ChecklistInstance`/`ChecklistItem`/`ChecklistItemResult` без явного обоснования в PR description;
- [ ] organizationId на бизнес-таблицах;
- [ ] индексы employee/observer/status/date;
- [ ] destructive Checklist changes отсутствуют;
- [ ] Prisma/migration gates проходят.

## PR 289 — Session lifecycle

**Цель:** серверная state machine для `ChecklistSession`, отдельная от существующего `ChecklistInstance.status` (assigned/in_progress/submitted/completed — про сдачу учеником), но согласованная с ней.

**Зависимости:** PR 288.

**Что необходимо сделать:**
- create/list/get/update/reschedule;
- start/pause/resume/complete/cancel;
- overdue derivation;
- append-only `ChecklistSessionEvent`;
- conditional transitions по `status/version`;
- stale write -> 409;
- критические транзакции Serializable с ограниченным retry на конфликт БД (`runSerializableWithRetry`, уже есть в `departments/public.ts` — переиспользовать, не копировать);
- запрет смены участников после старта.

Lifecycle: `scheduled -> in_progress -> paused -> in_progress -> completed`, плюс `scheduled -> cancelled`. `result_fixed` не хранить как session status: зафиксированный результат определяется revision/result state на `ChecklistInstance`.

**Критерии готовности:**
- [ ] invalid transitions отклоняются;
- [ ] terminal actions race-safe;
- [ ] lifecycle events сохраняются;
- [ ] state machine покрыта unit tests.

## PR 290 — Criteria, Skip, scoring v1, фото, геолокация

**Цель:** оценивание + evidence через существующий Checklist-пайплайн.

**Зависимости:** PR 288, PR 289, PR 287.

**Что необходимо сделать:**
- criterion result upsert через существующий `ChecklistItemResult` (не новая таблица результатов);
- snapshot scale/level mapping (из `ChecklistScale` при её выборе, иначе из `Checklist.scaleLevels`);
- per-criterion weight, required validation;
- answerState: unanswered/answered/skipped;
- Skip/auto-skip;
- earned/max только по non-skipped критериям; percentage = sum(earned)/sum(max)*100; all-skipped -> not_scored;
- фото: переиспользовать `ChecklistItemResult.photoUrl/photoObjectKey/photoFileName/photoMimeType/photoSizeBytes` и существующий upload/storage pipeline как есть — не создавать `ChecklistEvidence`, пока не понадобится >1 фото на критерий;
- не заявлять malware quarantine для checklist/session photos, пока pipeline реально его не использует;
- геолокация: `ChecklistLocationCapture`, start/end only через `getCurrentPosition` (`watchPosition` не использовать), off/optional/required, deny/unavailable, audited admin override, privacy-safe projection.

**Критерии готовности:**
- [ ] skipped исключён из numerator/denominator; all-skipped не равен 0%;
- [ ] photo IDOR невозможен; invalid upload отклоняется; upload security не регрессирует;
- [ ] continuous geolocation tracking отсутствует; максимум start+end; координаты не в generic notifications;
- [ ] edge cases покрыты.

## PR 291 — Scheduler, reminders, notifications

**Цель:** реальные автоматизированные события поверх существующей background-job инфраструктуры Checklist.

**Зависимости:** PR 289.

**Что необходимо сделать:**
- `ChecklistSessionReminderWorker`: новый файл-сосед `checklist-deadline.worker.ts` в том же модуле, тот же паттерн `BackgroundJobsService.registerHandler`/`registerRecurring`;
- persistent `ChecklistSessionReminder` ledger (PR 288);
- pre-start reminder за 24h и incomplete-after-start через 24h — это НЕ то же самое, что существующий `ChecklistDeadlineWorker` (который экспайрит просроченные `ChecklistInstance`), сосуществуют как два recurring job;
- created/rescheduled/cancelled/started/completed/reminder события через `ChecklistSessionEvent`;
- `Notification` + `OutboxEvent` (существующие модули);
- business idempotency в БД, не только queue dedupe;
- suppression reminder для terminal sessions;
- email только при production capability.

**Критерии готовности:**
- [ ] 24h reminder реально исполняется через реальный recurring job (не мок);
- [ ] retry не дублирует;
- [ ] terminal session не получает reminder;
- [ ] существующий `ChecklistDeadlineWorker` не регрессирует;
- [ ] отсутствие email не ломает workflow.

## PR 292 — Admin API

**Цель:** backend-контракт для admin UI (PR 294–296).

**Зависимости:** PR 289..PR 291.

**Что необходимо сделать:**
- list/filter/detail для `ChecklistSession`;
- single/bulk create: bulk создаёт независимые sessions;
- update/reschedule/cancel/repeat;
- observer reassignment до старта по access/lifecycle contract;
- participant lookup;
- published checklist lookup;
- pagination;
- result projection (из `ChecklistInstance` + `ChecklistSession`);
- errors/OpenAPI/audit.

**Критерии готовности:**
- [ ] API покрывает admin UI;
- [ ] bulk semantics определена;
- [ ] OpenAPI соответствует runtime;
- [ ] validation/access tests проходят.

## PR 293 — Evaluation Scales

**Цель:** переиспользуемые tenant-scoped шкалы, сосуществующие с `Checklist.scaleLevels`.

**Зависимости:** PR 288, PR 286.

**Что необходимо сделать:**
- `ChecklistScale`/`ChecklistScaleLevel`: name/status, ordered levels (value/label/score);
- create/edit/archive;
- запрет destructive изменения шкалы, уже попавшей в session snapshot;
- built-in presets допустимы как seed/default, не как hardcoded UI logic;
- явно НЕ мигрировать существующие `Checklist.scaleLevels` — оба механизма сосуществуют.

**Критерии готовности:**
- [ ] критерий использует scale из snapshot;
- [ ] archived scale нельзя выбрать для новой публикации;
- [ ] старые sessions не меняются после редактирования scale;
- [ ] обычные (не session) чек-листы с `scaleLevels` не затронуты.

## PR 294 — UI Foundation & Visual Contract

**Цель:** единый внешний вид согласно прототипу и текущей странице `AdminChecklistsPage`.

**Зависимости:** PR 285.

**Что необходимо сделать:**
- инвентаризировать UI primitives; reuse shell/header/buttons/forms/tabs/tables/badges/dialogs/cards/tooltips;
- определить недостающие reusable components;
- унифицировать status colors с существующими статусами `ChecklistInstance`;
- breakpoints; loading/empty/error patterns; chart integration; visual baselines.

**Критерии готовности:**
- [ ] новый design system не создан;
- [ ] UI согласован с существующей `AdminChecklistsPage`;
- [ ] responsive/accessibility rules зафиксированы;
- [ ] visual baseline существует.

## PR 295 — Admin: список сессий и wizard создания

**Цель:** экраны «Сессии» и «Создать сессию» — под-маршрут и модалка внутри `/admin/checklists` (см. таблицу маршрутов в 0.1), НЕ новый top-level route.

**Зависимости:** PR 292, PR 294.

**Список сессий:**
- header и `+ Новая сессия`;
- tabs Все/Запланированные/В процессе/Завершённые/Отменённые;
- filters/search; table: session, participants, observer, date/time, status, result; row actions/pagination; loading/empty/error.

**Wizard (модалка, как в прототипе `#wizardModal` — не отдельная страница):**
1. Участники: employee search, groups, observer, bulk.
2. Лист: published only, preview.
3. Время и место: date/time, duration, timezone, common/individual bulk schedule, location policy.
4. Подтверждение: summary, validation, create.

**Аномалии:** employee вне scope, observer unavailable, checklist archived между шагами, schedule conflict, server error, duplicate submit.

**Критерии готовности:**
- [ ] оба экрана — часть `/admin/checklists`, ни один не создал новый nav-item;
- [ ] структура соответствует прототипу; фильтры server-side; actions учитывают RBAC/state;
- [ ] Back/Next сохраняют state; invalid step блокируется; server error не стирает форму; duplicate submit защищён;
- [ ] single/bulk создаются через UI; keyboard/focus flow протестирован;
- [ ] visual regression test есть.

## PR 296 — Observation Sheet Builder

**Цель:** экран «Листы наблюдения» — под-маршрут `/admin/checklists/observation-sheets/:id/builder`.

**Зависимости:** PR 288, PR 293, PR 294.

**Что необходимо сделать:**
- title/status; context fields: label/type/required; groups: add/rename/copy/reorder;
- criteria table: add/reorder/edit/delete; per-item scale + weight + required/photo toggles;
- scale manager как secondary/contextual UI (не отдельный nav-item);
- settings: Skip, auto-skip, photo, geolocation, employee pre-session visibility;
- preview; save/publish.

**Критерии готовности:**
- [ ] под-маршрут `/admin/checklists`, не отдельный nav-item;
- [ ] UI редактирует snapshot settings; published lifecycle соблюдается; reorder сохраняется;
- [ ] destructive actions подтверждаются;
- [ ] существующий Checklist builder UX не регрессирует.

## PR 297 — Observer: mobile-first проведение

**Цель:** экран «Проведение» — расширение существующей `/instructor/checklists` (`InstructorChecklistReviewsPage`), не новая страница/роль.

**Зависимости:** PR 290, PR 291, PR 292, PR 294.

**Что необходимо сделать:**
- mobile header; employee/checklist; status/timer; progress N/M; criterion card; snapshot scale;
- selected state; comment; photo preview/upload; Skip; Back/Next; pause/resume/complete;
- structured feedback: strengths, development areas, next steps;
- geolocation permission; autosave/explicit save по API contract.

**UX:** touch targets >=44px, ошибки у критерия, ответы не теряются между шагами.

**Критерии готовности:**
- [ ] реализовано внутри `/instructor/checklists`, роль `instructor`, новая роль не создана;
- [ ] session полностью проводится на mobile;
- [ ] incomplete criteria корректно блокируют completion; photo/location errors обработаны;
- [ ] pause/resume сохраняют прогресс; 409 stale-session имеет понятный UX;
- [ ] accessibility проходит.

## PR 298 — Employee: «Мои обучающие сессии»

**Цель:** расширение существующей `/learn/checklists` (`LearnerChecklistsPage`), не новая страница.

**Зависимости:** PR 292, PR 294.

**Что необходимо сделать:**
- tabs Назначенные/В процессе/Завершённые; cards/list; checklist/observer/date/status/result;
- detail/result navigation; responsive behavior.

**Критерии готовности:**
- [ ] реализовано внутри `/learn/checklists`, новый nav-item не создан;
- [ ] employee видит только свои sessions; status/result понятны; completed открывает result;
- [ ] admin-only данные отсутствуют.

## PR 299 — Manager: analytics API и Dashboard

**Цель:** единственный новый пункт меню за весь модуль — `/manager/checklists`.

**Зависимости:** PR 287, PR 290, PR 294.

**Analytics API:**
- summary; employee breakdown; period/date range/checklist/department;
- scope = `OrganizationAccessScopeService` (Group ∪ Department ∪ ReportingLine), Department/ReportingLine — только intersection filter, никогда не расширяют RBAC-scope сверх union;
- result buckets; employee-first aggregation; trend time series; no-completion bucket;
- export contract при существующей инфраструктуре.

**Dashboard:**
- Week/Month/Quarter/custom date; Filters/Export при наличии contract;
- cards: low/high/no completed; donut: average + distribution; line chart: trend;
- employee table: employee/department/sessions/average/trend/actions; drill-down employee -> sessions -> result;
- loading/empty/error.

**Критерии готовности:**
- [ ] `/manager/checklists` — единственный новый пункт меню всего плана;
- [ ] scope применяется ко всем aggregates через `OrganizationAccessScopeService`, не голый Group-only `ManagerTeamScope`;
- [ ] число sessions не пере-взвешивает employee; no-completion не занижает average; trend/distribution детерминированы;
- [ ] metrics только из scoped API; filters отражены в URL; charts имеют accessible text equivalent;
- [ ] visual regression test есть; aggregation tests проходят.

## PR 300 — Admin: Session Report и аудируемый пересчёт

**Цель:** вложенный экран `/admin/checklists/sessions/:id` (drill-down, без своего nav-item) + пересчёт без уничтожения истории.

**Зависимости:** PR 292, PR 294, PR 298.

**Report:**
- header/status; tabs Сводка/Участники/Критерии/Файлы/История;
- participants/result/observer/date/checklist/location/photo count/comments;
- event history (`ChecklistSessionEvent`); revision history; repeat session;
- browser print-friendly report; server PDF/export — только при отдельной подтверждённой необходимости.

**Recalculate:**
- `ChecklistScoreRevision`; admin-only recalculate; required reason;
- пересчёт только из persisted `ChecklistItemResult` + immutable session snapshot; algorithm dispatch по version;
- previous/new score; AuditLog + `ChecklistSessionEvent`; revision history UI; retry/race protection.

**Критерии готовности:**
- [ ] вложенный экран без отдельного nav-item; данные соответствуют snapshot/history;
- [ ] nested resources object-scoped; tabs имеют loading/error/empty; history immutable client-side;
- [ ] старый результат сохранён при пересчёте; actor/reason/before/after сохранены; non-admin denied;
- [ ] UI показывает revisions.

## PR 301 — Concurrency и idempotency

**Цель:** исключить двойное создание/завершение/пересчёт.

**Зависимости:** PR 289, PR 291, PR 300.

**Что необходимо сделать:**
- `ChecklistSession.version`; conditional writes; 409 для stale client;
- Serializable transaction там, где меняются lifecycle/result/revision (`runSerializableWithRetry`);
- bounded retry DB conflict; idempotency для create/complete/recalculate/reminders.

**Критерии готовности:**
- [ ] concurrent complete создаёт один terminal result;
- [ ] retry не создаёт дубликаты;
- [ ] stale client получает 409 без silent overwrite.

## PR 302 — Observer unavailable / reassignment

**Цель:** рабочий сценарий недоступного наблюдателя.

**Зависимости:** PR 289, PR 287, PR 291, PR 295.

**Что необходимо сделать:**
- unavailable business state/reason; admin/разрешённый manager CTA «Заменить наблюдателя»;
- reassignment до старта; notification/outbox event; audit/session event.

**Критерии готовности:**
- [ ] unavailable не блокирует управление session;
- [ ] reassignment object-scoped;
- [ ] история назначения сохраняется.

## PR 303 — Timezone contract

**Цель:** однозначное расписание.

**Зависимости:** PR 289, PR 295.

**Что необходимо сделать:**
- хранить instant + IANA timezone/context; wizard показывает timezone только когда это полезно;
- reminder рассчитывается от session instant; DST boundary tests.

**Критерии готовности:**
- [ ] UI/API показывают одинаковое время;
- [ ] DST не сдвигает reminder/session;
- [ ] reschedule пересчитывает automation безопасно.

## PR 304 — Privacy, retention и audit

**Цель:** ограничить чувствительные данные.

**Зависимости:** PR 290, PR 300.

**Что необходимо сделать:**
- exact coordinates только ролям/объектам по policy; generic notifications без coordinates;
- evidence/location access audit; retention hooks/config только после утверждения policy;
- admin geo override требует reason и audit.

**Критерии готовности:**
- [ ] employee/manager projections не раскрывают лишнее;
- [ ] override имеет actor/reason/time;
- [ ] retention не выдумана: до решения помечена как release blocker.

## PR 305 — Progressive disclosure и финальный UX

**Цель:** сохранить простоту прототипа при функциональной полноте, финально проверить таблицу маршрутов из раздела 0.1.

**Зависимости:** PR 294..PR 304.

**Что необходимо сделать:**
- проверить: за весь модуль появился ровно один новый пункт меню (`/manager/checklists`);
- settings открывать контекстно; scales — из builder/secondary page;
- reminders — notifications/system automation, diagnostics только admin;
- revisions — в history отчёта; observer unavailable — badge + reassignment CTA;
- backend guarantees не выводить в labels/help обычного пользователя.

**Критерии готовности:**
- [ ] ежедневный admin flow начинается с `/admin/checklists`;
- [ ] primary nav не сложнее исходного `admin.nav.checklists` + один пункт `/manager/checklists`;
- [ ] backend jargon отсутствует в основном UI.

## PR 306 — UI State & Anomaly Matrix

**Цель:** эксплуатационные состояния, не только happy path.

**Зависимости:** PR 295..PR 300.

**Обязательные состояния:** loading, empty, success, validation, API error, permission denied, not found, stale/conflict.

**Обязательные аномалии:**
1. 403 manager scope. 2. 404 session. 3. 409 completed in another tab. 4. Checklist archived during wizard. 5. Observer blocked/unavailable. 6. Photo rejected. 7. Storage failure. 8. Geolocation denied. 9. Geolocation unavailable. 10. Required location + audited override. 11. All criteria skipped. 12. Incomplete mandatory criteria. 13. Reminder retry. 14. Cancelled reminder suppression. 15. Analytics no-data. 16. Partial chart data. 17. Duplicate create/complete.

**Критерии готовности:**
- [ ] нет silent data loss; пользователь понимает следующее действие;
- [ ] security errors не раскрывают чужие данные; retry безопасен;
- [ ] anomalies покрыты integration/E2E.

## PR 307 — E2E, security, accessibility, visual regression

**Цель:** доказать функциональное и визуальное соответствие прототипу.

**Зависимости:** PR 286..PR 306.

**Обязательные E2E:**
1. Admin создаёт session wizard-ом. 2. Session появляется в list. 3. Observer проводит session на mobile. 4. Photo прикрепляется. 5. Geolocation start/end. 6. Employee видит result. 7. Manager видит scoped metrics. 8. Manager drill-down. 9. Чужой manager denied и не влияет на aggregate. 10. Checklist changed after scheduling — snapshot stable. 11. Admin report. 12. Recalculation creates revision. 13. Cancelled session no reminder. 14. Concurrent complete -> safe 409. 15. All-skipped -> not_scored.

**Проверки:** lint, typecheck, unit, integration, migrations, build, E2E, accessibility, visual regression, security gates.

**Критерии готовности:**
- [ ] critical E2E зелёные; cross-tenant/IDOR matrix зелёная;
- [ ] existing Checklist tests зелёные (unit + `checklist-deadline`/`checklist-review-access`/`checklists.*.spec.ts`);
- [ ] mobile observer baseline зелёный; admin/manager desktop baselines зелёные;
- [ ] CI не ослаблен.

## PR 308 — Документация, release readiness, production verification gates

**Цель:** поддерживаемый production-ready режим Checklist-модуля.

**Зависимости:** PR 307.

**Что необходимо сделать:**
- OpenAPI/API docs; `docs/contracts/API_RBAC_MATRIX.md` (не отдельный RBAC-документ);
- admin/observer/employee/manager guides; scoring/skip; geolocation/privacy; notifications/reminders; recalculation;
- migrations/rollback; screenshots; changelog/release note по правилам проекта;
- Production verification gates: Redis/background worker (уже используется `ChecklistDeadlineWorker` — подтвердить, не описывать как неизвестность), object storage + CORS/presigned upload/download, mail provider/SLA если email включён, geolocation retention/legal policy, production-like load/latency, observability/alerts.

**Критерии готовности:**
- [ ] docs соответствуют runtime; не описаны несуществующие функции;
- [ ] API/RBAC/security синхронизированы; rollback strategy описана;
- [ ] каждый production-gate подтверждён фактической проверкой, неподтверждённое — `[НЕ ПРОВЕРЕНО]`;
- [ ] release checklist завершён.

---

# UI State Matrix

| Экран | Loading | Empty | Validation | API error | 403 | 404 | 409 |
|---|---|---|---|---|---|---|---|
| Admin session list | Да | Да | — | Да | Да | — | — |
| Creation wizard | lookup | — | Да | Да | Да | — | Да |
| Observation builder | Да | Да | Да | Да | Да | Да | Да |
| Observer session | Да | — | Да | Да | Да | Да | Да |
| Employee sessions | Да | Да | — | Да | Да | — | — |
| Manager dashboard | Да | Да | — | Да | Да | — | — |
| Session report | Да | Частично | — | Да | Да | Да | Да |

# Traceability: экран прототипа -> work item

| Экран прототипа | PR |
|---|---|
| ＋ Создать сессию (wizard) | PR 295 |
| ▣ Сессии (список) | PR 295 |
| ☑ Листы наблюдения (builder) | PR 296 |
| ◉ Проведение (mobile observer) | PR 297 |
| ♙ Мои сессии (employee) | PR 298 |
| ◔ Панель руководителя | PR 299 |
| ▤ Отчёт | PR 300 |
| Lifecycle | PR 289 |
| Фото/геолокация/scoring | PR 290 |
| Напоминания/уведомления | PR 291 |
| Аномалии | PR 306 |
| Шкалы | PR 293 |
| Concurrency/idempotency | PR 301 |
| Observer unavailable | PR 302 |
| Timezone | PR 303 |
| Privacy/retention/audit | PR 304 |
| Progressive disclosure / маршруты | PR 305 |
| Production gates | PR 308 |
| Визуальное соответствие | PR 294 + PR 307 + PR 305 |

# Последовательность

**Этап A — Domain foundation:** `PR 285 -> PR 286 -> PR 287 -> PR 288 -> PR 289 -> PR 290`

**Этап B — Automation & Admin API:** `PR 291 -> PR 292 -> PR 293`

**Этап C — UI foundation & Admin:** `PR 294 -> PR 295 -> PR 296`

**Этап D — Role workflows:** `PR 297 -> PR 298 -> PR 299 -> PR 300`

**Этап E — Integrity:** `PR 301 -> PR 302 -> PR 303 -> PR 304 -> PR 305 -> PR 306`

**Этап F — Production readiness:** `PR 307 -> PR 308`

# Definition of Done

Режим считается завершённым только если:

- [ ] существует admin wizard с 4 шагами (модалка внутри `/admin/checklists`);
- [ ] существует admin session list с tabs/search/filters/statuses (под `/admin/checklists`);
- [ ] существует observation sheet builder (под `/admin/checklists`);
- [ ] существует полноценный mobile observer flow (внутри `/instructor/checklists`);
- [ ] существует employee «Мои обучающие сессии» (внутри `/learn/checklists`);
- [ ] существует manager dashboard (`/manager/checklists` — единственный новый пункт меню всего плана);
- [ ] dashboard содержит average/distribution и trend visualization; employee table и drill-down;
- [ ] существует session report с tabs (вложенный экран, без своего nav-item);
- [ ] lifecycle `ChecklistSession` соответствует backend state machine и согласован с `ChecklistInstance.status`;
- [ ] scale/weight/groups/context fields/structured feedback работают по snapshot;
- [ ] photo (через существующий `ChecklistItemResult`)/geolocation/comments/Skip работают по policy;
- [ ] reminders используют persistent ledger и реально исполняются, не мешая существующему `ChecklistDeadlineWorker`;
- [ ] observer unavailable/reassignment работает;
- [ ] recalculation сохраняет immutable history;
- [ ] RBAC/object-level enforced backend-ом через `OrganizationAccessScopeService`;
- [ ] loading/empty/error/403/404/409/photo/location states реализованы;
- [ ] desktop admin/manager визуально сопоставимы с прототипом; mobile observer визуально сопоставим с прототипом;
- [ ] существующий LMS design system сохранён; accessibility и visual regression проходят;
- [ ] существующие Checklist flows (unit/integration/E2E) не регрессировали;
- [ ] обязательный CI зелёный;
- [ ] production verification gates подтверждены перед rollout;
- [ ] за весь модуль появился ровно один новый top-level пункт меню (`/manager/checklists`) — если появилось больше, это регрессия к ошибке модуля «Оргструктура» и должно быть исправлено до мержа.

# Критический путь

`PR 285 -> PR 288 -> PR 289 -> PR 290 -> PR 287 -> PR 292 -> PR 294 -> PR 295 -> PR 297 -> PR 300 -> PR 301 -> PR 305 -> PR 307 -> PR 308`
