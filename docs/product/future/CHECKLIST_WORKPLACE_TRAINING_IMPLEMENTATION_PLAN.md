# План реализации: Чек-лист — обучение на рабочем месте

**Основание:** прототип `CHECKLIST_WORKPLACE_TRAINING_PROTOTYPE_V3.html` (лежит в этой же папке) и проверенные контракты репозитория.
**Статус:** реализация начата. PR 285 (архитектурные/продуктовые контракты) и PR 286 (organization-level настройки) выполнены. PR 287 (object-level authorization) частично: существующие checklist review/analytics эндпоинты переведены на `OrganizationAccessScopeService`, а `ChecklistSession` policy-функция (`sessionScope()`) определена и unit-протестирована. PR 288 (Prisma domain model для `ChecklistSession`) реализован. PR 289 (session lifecycle) реализован: `ChecklistSessionService` (`apps/api/src/modules/checklists/checklist-session.service.ts`) — серверная state machine (`scheduled -> in_progress -> paused -> in_progress -> completed`, плюс `scheduled -> cancelled`), optimistic-concurrency переходы через `version` (409 на stale write, отдельно от 400 на invalid transition), Serializable-транзакции с retry (`runSerializableWithRetry`, переиспользован из `departments/public.ts`, не скопирован), append-only `ChecklistSessionEvent`, запрет смены участников после старта. `sessionScope()` (PR 287) теперь реально вызывается из production-кода — маршруты `/checklist-sessions*` (`checklistSessionsRead`/`checklistSessionsManage`/`checklistSessionsRun` в `roles.ts`) — это закрывает предыдущую оговорку про "enforcement подтверждается только по мере появления реальных эндпоинтов". PR 290 (Criteria/Skip/scoring v1/фото/геолокация) реализован: skip-эндпоинт и weight/answerState-scoring встроены в существующий `ChecklistItemResult`/`ChecklistInstance` пайплайн (без новых таблиц результатов), `ChecklistInstance.scored` различает "all-skipped/not_scored" от настоящего 0%, фото-pipeline переиспользован без изменений, геолокация — `POST/GET /checklist-sessions/:id/location(/...)` с create-only "start/end only" (409 на дубликат), `off`-policy отказом и audited admin override. `ChecklistScale`-маппинг из этого PR намеренно исключён — `ChecklistSession` пока не ссылается на `ChecklistScale`, это остаётся за PR 293. PR 291 (Scheduler/reminders/notifications) реализован: `ChecklistSessionReminderWorker` — recurring job-сосед `ChecklistDeadlineWorker` на отдельном job name/scheduler id; `pre_start` (24h до `scheduledAt`) и `incomplete_after_start` (24h после `startedAt`) напоминания создаются/двигаются/подавляются хуками в `ChecklistSessionService.create/update/transition`; сам воркер — первый реальный consumer связки `Notification`+`OutboxEvent` в проекте, с business-идемпотентностью на уровне БД (условный `updateMany(...WHERE status='pending')`, а не только dedupe очереди); email — provider-neutral webhook (`ChecklistSessionReminderDelivery`, зеркалит `PasswordResetDelivery`), отсутствие конфигурации — валидный no-op. PR 292 (Admin API) реализован: bulk create (`POST /checklist-sessions/bulk`, per-recipient partial success через существующий `ChecklistsService.assignChecklist`), repeat (`POST /checklist-sessions/:id/repeat`, свежая пара instance+session, учитывает независимость session/instance lifecycle — completed session не значит completed instance), participant lookup (`GET /checklist-sessions/participants`, learner-lookup team-scoped через новый `ChecklistReviewAccessService.participantLearnerScope()`), published checklist lookup (`GET /checklists?status=published`), result projection (`list()`/`get()` теперь джойнят `checklist`/`learner`/`observer`/`result` из `ChecklistInstance`) и расширенные list-фильтры (`checklistId`/`learnerId`/`scheduledFrom`/`scheduledTo`/`search`) — без новых таблиц и новых role policies (переиспользованы `checklistSessionsManage`/`checklistSessionsRead`/`checklistsRead`). PR 293 (Evaluation Scales) реализован: `ChecklistItem.scaleId` (новая миграция `20260923120000_add_checklist_item_scale_ref`; сами таблицы `ChecklistScale`/`ChecklistScaleLevel` существовали с PR 288) — опциональная per-criterion ссылка на переиспользуемую шкалу, независимая от checklist-level `scoringMode`/`Checklist.scaleLevels`; `ChecklistScaleService` (create/update/archive, без RBAC-политик — переиспользованы `checklistsRead`/`checklistsCreate`); update отклоняется, если шкала уже используется хотя бы одним assigned-инстансом (archive — единственный разрешённый переход в этом случае, всегда неразрушителен); scale резолвится в `ChecklistScale`/`ChecklistScaleLevel` ровно один раз при `assignChecklist`/`bulkAssignChecklist` и встраивается в `templateSnapshot` — все читатели дальше используют только снэпшот, никогда live-таблицу; публикация чек-листа с критерием на архивную шкалу отклоняется, но уже опубликованные чек-листы не затрагиваются последующей архивацией. PR 294 (UI Foundation & Visual Contract) реализован: `Badge` расширен нейтральными тонами `success`/`info`/`danger`, `checklistStatus.ts` — единый источник статус→тон mapping для инстансов, `ADR_CHECKLIST_SESSION_OVERLAY.md` зафиксировал shell/tabs/dialog/breakpoints/responsive-table решения для всех следующих экранов. PR 295 (Admin: список сессий и wizard создания) реализован: `AdminChecklistSessionsPage` — под-маршрут `/admin/checklists/sessions` (не новый top-level nav-item), переиспользует `AdminPageLayout`/`AdminPageHeader`/`DataTable`/`Pagination`; новый `ChecklistsTabs` (переиспользует `OrgStructureTabs`-паттерн, не ARIA-tablist) связывает список чек-листов и список сессий; серверные фильтры (status/search/pagination) через уже существующий `GET /checklist-sessions`; wizard создания построен на новых `Dialog`/`WizardDialog` primitives в `shared/ui.tsx` (генерализация `ConfirmDialog`'s `ds-dialog` shell, как и требовал ADR PR 294, а не третья реализация модалки) — 4 шага (участники/лист/время и место/подтверждение) с невозможностью продвинуться на невалидном шаге (`WizardDialog`'s новый `nextDisabled`), bulk-создание через `POST /checklist-sessions/bulk` и опциональный auto-start цепочкой `GET .../:id` + `POST .../:id/start` для «Начать сейчас» (атомарного create-and-start эндпоинта в API нет). Намеренно не реализовано в PR 295 (честно задокументированный gap, не блокирует остальной workstream): индивидуальное расписание на сотрудника в bulk-режиме (backend поддерживает только одно общее время на batch), выбор часового пояса (используется только определённый браузером, без picker'а), поле «продолжительность» из прототипа (нет backend-поля), детальный экран отчёта по сессии (`▤ Отчёт`, отдельный PR), drawer «Настройки» (уже есть своя точка входа из PR 286), обнаружение конфликтов расписания наблюдателя (backend-концепции не существует). PR 296 (Observation Sheet Builder) реализован: расширяет существующий `ChecklistBuilder` (не новый URL-маршрут) новой моделью `ChecklistItemGroup` (add/rename/copy/reorder, `SetNull` FK, без delete-эндпоинта), `Checklist.contextFields`/`defaultLocationCapturePolicy`/`preSessionVisibility` (все резолвятся в `templateSnapshot` на момент назначения, `CHECKLIST_SNAPSHOT_VERSION` не увеличена), критерии получили per-item `weight`/`scale`-select (впервые дав frontend PR 293's `ChecklistScale`-библиотеке — новый `ScaleManagerDialog`, secondary/contextual `Dialog`). Никаких новых role policies. PR 297 (Observer: mobile-first проведение) реализован: расширяет существующий `/instructor/checklists` (`InstructorChecklistReviewsPage`) новой вкладкой «Проведение» (`ChecklistSessionsToConduct` — список собственных сессий наблюдателя через уже существующий `GET /checklist-sessions`, `sessionScope()` для чистого `instructor` уже равен `{observerId: user.id}`, поэтому дополнительный фильтр не нужен), открывающей mobile-first `ChecklistSessionConduct` — новая роль/страница/URL-маршрут не созданы (тот же паттерн in-page state, что у существующего `ReviewDetail`). Экран проведения: mobile-заголовок (аватар/имя/чек-лист/статус/таймер), progress bar по обязательным критериям, пошаговый Back/Next по критериям с карточкой критерия (snapshot-шкала `item.scale` при её наличии, иначе checklist-level `scoringMode`), комментарий с явным сохранением, Skip (только если `item.allowSkip`), фото с локальным preview (`URL.createObjectURL`) и прогрессом загрузки (`uploadChecklistItemPhotoWithProgress`, чей progress-callback до этого нигде не использовался), pause/resume/complete (Complete заблокирован на клиенте, пока не отвечены все обязательные критерии), одноразовая геолокация на старте/завершении (`getCurrentPosition`, никогда `watchPosition`; denied/unavailable тоже отправляются — не тихий пропуск), явный "reload"-UX на 409 (stale version) вместо generic-ошибки. Новый бэкенд-эндпоинт `PATCH /checklist-sessions/:id/feedback` (миграция `20260923160000_add_checklist_session_feedback`: `ChecklistSession.strengths/developmentAreas/nextSteps`, nullable text, плюс `feedback_updated` в `ChecklistSessionEventType`) — структурированная обратная связь оказалась не покрыта ни одним существующим полем ни в одной из PR 285-296 (честно задокументированный gap, закрытый в рамках этого PR, а не отложенный), переиспользует `checklistSessionsRun`, тот же optimistic-concurrency контракт (`version`/409), каждое поле независимо сохраняемо (partial autosave). Контекстные поля чек-листа (PR 296 `contextFields`) сознательно не реализованы в этом экране — их нет в списке критериев готовности PR 297, а для них нет backend-хранилища значений (только определения полей на самом чек-листе) — остаётся задокументированным gap для будущего PR, если/когда он потребуется. `ChecklistItemGroup` (PR 296) по-прежнему не попадает в снэпшот и не влияет на экран проведения — критерии показываются единым плоским списком, как и раньше.
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

## PR 285 — Архитектурные и продуктовые контракты ✅

**Статус:** реализовано — `docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md`.

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
- [x] решение "Session = overlay ChecklistInstance" задокументировано и не имеет альтернативных трактовок;
- [x] Observer однозначно = `instructor`;
- [x] state machine и scoring однозначны;
- [x] role/object policies определены;
- [x] нет циклической зависимости;
- [x] unresolved decisions имеют safe defaults (`criticalThreshold`/`lowThreshold` — см. `docs/status/OPEN_DECISIONS.md` DEC-CHKS-001, единственное исключение, явно допущенное планом).

## PR 286 — Organization-level настройки ✅

**Статус:** реализовано — `ChecklistWorkplaceSettingsService`, `GET/PATCH /checklists/workplace-settings` (`apps/api/src/modules/checklists/`), Prisma-модель `ChecklistWorkplaceSettings` (миграция `20260922150000_add_checklist_workplace_settings`).

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
- [x] настройки tenant-scoped (unique `organizationId`, `organizationId` всегда из `currentUser`, никогда из body/params);
- [x] safe defaults существуют (возвращаются даже без строки в БД — строка создаётся лениво при первом `PATCH`, как `organization_themes`);
- [x] frontend не источник истины (Zod-валидация + `checklistWorkplaceSettingsWrite: admin`-only на сервере);
- [x] настройки покрыты тестами (`checklist-workplace-settings.service.spec.ts`, RBAC/делегирование в `checklists.controller.rbac.spec.ts`, полный app-bootstrap через `api.database-smoke.spec.ts` против реального Postgres).

## PR 287 — Object-level authorization ✅

**Статус: реализовано.** `ChecklistReviewAccessService` переведён с group-only `ManagerTeamScope` на
`OrganizationAccessScopeService`, поэтому direct access, review queue и analytics **для уже существующих
эндпоинтов** используют единый effective manager scope (Group ∪ Department DIRECT ∪ ReportingLine DIRECT).
Фильтрация pending-review перенесена в Prisma-запрос, чтобы строки вне scope не загружались для последующей
фильтрации в памяти.

В том же сервисе добавлен метод `sessionScope()` — canonical policy-функция для `ChecklistSession` parent-scope
(admin — весь tenant, manager — effective organization scope, instructor — только назначенный `observerId`,
learner — только собственный `ChecklistInstance`; dual-role manager+instructor получает union). **История
честности этого пункта:** на момент исходного коммита `ChecklistSession` как Prisma-модели/эндпоинта не
существовало — `sessionScope()` была написана и unit-протестирована изолированно, но нигде не вызывалась из
production-кода, поэтому 3 критерия ниже были временно откачены обратно в `[ ]` с пояснением "закроется, когда
PR 288–292 реально свяжут policy с эндпоинтами". Это произошло в PR 289 (список/деталь/события/обновление/все
lifecycle-переходы сессии) и PR 290 (геолокация как вложенный ресурс) — `sessionScope()` теперь реально
вызывается в 7 точках `checklists.controller.ts`, подтверждено negative-access тестами на реальный 404 вне
scope. Все критерии закрыты честно, задним числом, по факту появления вызывающего кода, а не по факту написания
самой policy-функции.

**Цель:** исключить IDOR/cross-tenant доступ, переиспользуя, а не дублируя существующий access-слой.

**Зависимости:** PR 285.

**Что необходимо сделать:**
- расширить `ChecklistReviewAccessService`: перевести его внутреннюю зависимость с `ManagerTeamScope` на `OrganizationAccessScopeService` (Group ∪ Department DIRECT ∪ ReportingLine DIRECT), добавить observer assignment и employee self-scope для `ChecklistSession`;
- admin organization scope (tenant-wide, без изменений);
- inherited nested-resource access (evidence/location через `ChecklistSession`/`ChecklistInstance`);
- server-side list/analytics filtering.

**Критерии готовности:**
- [x] `ChecklistReviewAccessService` использует `OrganizationAccessScopeService`, не сырой `ManagerTeamScope`;
- [x] manager не видит employee вне scope (Group/Department/ReportingLine union) — для существующих checklist review/analytics эндпоинтов;
- [x] observer не проводит чужую session — закрыто в PR 289: `sessionScope()` теперь реально вызывается в каждом read/write-маршруте `/checklist-sessions*` (7 точек вызова в `checklists.controller.ts` — list/get/events/update/start/pause/resume/complete/cancel/location), для instructor это `{ observerId: user.id }`; негативный тест на реальный 404 вне scope есть в `checklist-session.service.spec.ts` (`transition`/`captureLocation` кейсы "throws 404 when the session is outside the caller scope");
- [x] employee видит только свои sessions — закрыто в PR 289: для learner scope = `{ instance: { userId: user.id } }`, применяется тем же общим путём (`...scope` в каждом `findFirst`/`findMany` для `ChecklistSession`), покрыто той же 404-проверкой и `checklist-review-access.service.spec.ts`'s существующими per-role тестами `sessionScope()`;
- [x] nested UUID не обходит authorization — закрыто в PR 289/290: `listEvents`/`captureLocation`/`listLocationCaptures` все сначала находят родительскую `ChecklistSession` через `{id, organizationId, ...scope}` и только потом действуют на вложенный ресурс — валидный чужой capture/event UUID сам по себе доступа не даёт, поскольку до него не доходит без прохождения родительской scope-проверки;
- [x] negative access tests покрывают endpoint families — для существующих эндпоинтов (`getAnalytics`/`listPendingReview`/`searchReviewQueue`/`assertReviewerCanAccess`);
- [x] существующие Checklist review-access тесты не регрессируют.

## PR 288 — Prisma domain model и migrations ✅

**Статус:** реализовано — миграция `20260922180000_add_checklist_session_domain`
(`apps/api/prisma/migrations/`), применена и проверена на реальном локальном PostgreSQL 16, нулевой
дрейф между историей миграций и `schema.prisma`. Никакого runtime-кода/эндпоинтов поверх схемы ещё
нет — это делают PR 289+. `docs/runbooks/MIGRATION_BACKUP_POLICY.md` содержит подробный per-migration
разбор.

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
- [x] ни одно новое поле не дублирует существующее поле `ChecklistInstance`/`ChecklistItem`/`ChecklistItemResult` без явного обоснования — `weight`/`allowSkip`/`autoSkipUnanswered` объяснены в migration policy doc; счёт/статус остаются только на `ChecklistInstance`, `ChecklistScoreRevision` — только audit trail;
- [x] organizationId на бизнес-таблицах — все 7 новых таблиц;
- [x] индексы employee/observer/status/date — `(organizationId, status)`, `(organizationId, observerId)`, `(organizationId, scheduledAt)` на `ChecklistSession`, `(organizationId, createdAt)`/`(sessionId, createdAt, id)` на event-таблицах ("employee" достижим через `instance.userId`, у самой `ChecklistSession` нет прямого employee-поля — она overlay над `ChecklistInstance`);
- [x] destructive Checklist changes отсутствуют — только `ADD COLUMN`/`CREATE TABLE`/`CREATE TYPE`;
- [x] Prisma/migration gates проходят — типы, lint, `architecture:check` (35 модулей, новых boundary нет), 2010 unit-тестов, применение миграции + drift-check + 8 новых integration-тестов на реальном Postgres 16, все зелёные.

## PR 289 — Session lifecycle ✅

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
- [x] invalid transitions отклоняются — `ChecklistSessionService.transition()` проверяет текущий `status` против допустимого `from` списка *до* проверки версии и возвращает 400 (`BadRequestException`), отдельно от 409 stale-write;
- [x] terminal actions race-safe — `checklist-session-lifecycle.database.spec.ts` (реальный Postgres) гоняет две одновременные конкурирующие транзакции на одну сессию (`start`/`start` и `pause`/`complete`) через `runSerializableWithRetry`, подтверждает, что выигрывает ровно одна и ровно одно lifecycle-событие записывается;
- [x] lifecycle events сохраняются — каждый transition/create/reschedule пишет `ChecklistSessionEvent` в той же транзакции, что и мутацию (проверено и unit-тестом, и database-тестом на полном цикле `created -> started -> paused -> resumed -> completed`);
- [x] state machine покрыта unit tests — `checklist-session.service.spec.ts` (15 тестов, mocked Prisma): все переходы, invalid-transition, stale-version, потерянная гонка на `updateMany`, scope-based 404, reschedule/observer_reassigned.

## PR 290 — Criteria, Skip, scoring v1, фото, геолокация ✅

**Цель:** оценивание + evidence через существующий Checklist-пайплайн.

**Зависимости:** PR 288, PR 289, PR 287.

**Что необходимо сделать:**
- criterion result upsert через существующий `ChecklistItemResult` (не новая таблица результатов) — выполнено, плюс новый explicit `POST .../items/:itemId/skip` эндпоинт (та же `checklistItemResultsWrite` policy и reviewer/ownership-проверки, что и у существующего submit);
- snapshot scale/level mapping (из `ChecklistScale` при её выборе, иначе из `Checklist.scaleLevels`) — **не в этом PR**: `ChecklistSession` не хранит ссылку на `ChecklistScale` (её появление — предмет PR 293 «Evaluation Scales»), поэтому мапить пока нечего; scoring v1 в этом PR работает только через существующий `Checklist.scaleLevels`, как и раньше;
- per-criterion weight, required validation — выполнено: `weight` (default 1) участвует в earned/max, `autoSkipUnanswered=true` требует `allowSkip=true` (422 при создании, серверная re-валидация против текущего состояния БД при partial `PATCH`);
- answerState: unanswered/answered/skipped — выполнено (`ChecklistAnswerState` enum + колонка на `ChecklistItemResult`);
- Skip/auto-skip — выполнено: explicit skip через новый эндпоинт, auto-skip персистится как настоящая `answerState='skipped'` строка при первом же recompute, если критерий с `autoSkipUnanswered=true` остаётся без ответа;
- earned/max только по non-skipped критериям; percentage = sum(earned)/sum(max)*100; all-skipped -> not_scored — выполнено (`ChecklistInstance.scored`, новая колонка, `false` когда max=0);
- фото: переиспользовать `ChecklistItemResult.photoUrl/photoObjectKey/photoFileName/photoMimeType/photoSizeBytes` и существующий upload/storage pipeline как есть — не создавать `ChecklistEvidence`, пока не понадобится >1 фото на критерий — выполнено, pipeline не тронут;
- не заявлять malware quarantine для checklist/session photos, пока pipeline реально его не использует — соблюдено, нигде не заявлено;
- геолокация: `ChecklistLocationCapture`, start/end only через `getCurrentPosition` (`watchPosition` не использовать), off/optional/required, deny/unavailable, audited admin override, privacy-safe projection — выполнено: `POST/GET /checklist-sessions/:id/location(/...)`, create-only (дубликат по `(session, point)` -> 409), `off` отклоняет попытку захвата, override не-наблюдателем требует `overrideReason` и пишет `ChecklistSessionEvent(location_override)`, `GET` редактирует координаты для всех, кроме назначенного observer и admin.

**Критерии готовности:**
- [x] skipped исключён из numerator/denominator; all-skipped не равен 0% — unit-тесты (`checklists.service.spec.ts`) + database-тест (`checklist-scoring-v1.database.spec.ts`) на реальном Postgres;
- [x] photo IDOR невозможен; invalid upload отклоняется; upload security не регрессирует — существующий photo pipeline не изменён, все существующие photo/upload-тесты (`checklists.photo-review.spec.ts` и др.) остаются зелёными без единой правки в их логике;
- [x] continuous geolocation tracking отсутствует; максимум start+end; координаты не в generic notifications — уникальный constraint (PR 288) + create-only сервисный слой (409 на дубликат, database-тестом подтверждено); модуль notifications в этом PR не тронут вообще, так что координаты физически не могут попасть ни в одно generic-уведомление;
- [x] edge cases покрыты — stale-геолокация (дубликат), `off`-policy отказ, admin override + аудит, weight-арифметика, all-skipped/not_scored, un-skip после skip — все покрыты unit- и/или database-тестами.

## PR 291 — Scheduler, reminders, notifications ✅

**Цель:** реальные автоматизированные события поверх существующей background-job инфраструктуры Checklist.

**Зависимости:** PR 289.

**Что необходимо сделать:**
- `ChecklistSessionReminderWorker` (`apps/api/src/modules/checklists/checklist-session-reminder.worker.ts`): новый файл-сосед `checklist-deadline.worker.ts` в том же модуле, тот же паттерн `BackgroundJobsService.registerHandler`/`registerRecurring` — выполнено, отдельный job name (`checklists.session-reminders-due`) и scheduler id (`checklists-session-reminders-due-v1`), не пересекается с `checklists.expire-overdue`;
- persistent `ChecklistSessionReminder` ledger (PR 288) — выполнено: `ChecklistSessionService.create/update/transition` пишут/двигают/подавляют строки через новые чистые хелперы (`checklist-session-reminders.ts`), сам worker только читает `pending`-строки и переводит их в `sent`/`suppressed`;
- pre-start reminder за 24h и incomplete-after-start через 24h — это НЕ то же самое, что существующий `ChecklistDeadlineWorker` (который экспайрит просроченные `ChecklistInstance`), сосуществуют как два recurring job — выполнено: `pre_start` создаётся/двигается при `create`/reschedule (или подавляется, если `scheduledAt` снят), `incomplete_after_start` создаётся ровно один раз при `start`;
- created/rescheduled/cancelled/started/completed/reminder события через `ChecklistSessionEvent` — выполнено (`reminder_sent` теперь реально пишется воркером в той же транзакции, что и Notification/OutboxEvent);
- `Notification` + `OutboxEvent` (существующие модули) — выполнено: `OutboxService.runInTransaction` пишет `ChecklistSessionReminder`(sent)/`ChecklistSessionEvent`(reminder_sent)/`Notification`/`OutboxEvent` в одной транзакции; `OutboxEvent` — это первый реальный consumer связки Notification+OutboxEvent в проекте;
- business idempotency в БД, не только queue dedupe — выполнено: условный `updateMany(... WHERE status='pending')` на `ChecklistSessionReminder`, `count !== 1` означает "уже обработано конкурентным запуском", независимо от `idempotencyKey` очереди;
- suppression reminder для terminal sessions — выполнено на двух уровнях: при `complete`/`cancel` (сервис сразу помечает pending-напоминания `suppressed`) и defensively в самом воркере (если сессия почему-то terminal, а строка всё ещё `pending`);
- email только при production capability — выполнено: `ChecklistSessionReminderDelivery` (зеркалит `PasswordResetDelivery`) — не настроенный `CHECKLIST_SESSION_REMINDER_DELIVERY_URL` это валидный no-op, in-app `Notification` не зависит от него.

**Критерии готовности:**
- [x] 24h reminder реально исполняется через реальный recurring job (не мок) — `checklist-session-reminders.database.spec.ts` вызывает настоящий `ChecklistSessionReminderWorker.processDue()` (не замоканный Prisma) на реальном Postgres и проверяет полный цикл create → due → sent → Notification/Event/OutboxEvent;
- [x] retry не дублирует — database-тест гоняет два параллельных `processDue()` на одном due-напоминании и подтверждает ровно один `Notification`/`ChecklistSessionEvent`;
- [x] terminal session не получает reminder — подавление на уровне сервиса (integration-тест: start → complete → напоминание `suppressed`) и defensive-проверка воркера (session принудительно `cancelled` в обход сервиса, pending-строка всё ещё существует — воркер её тоже не отправляет, только подавляет);
- [x] существующий `ChecklistDeadlineWorker` не регрессирует — файл не тронут, `checklist-deadline.database.spec.ts` зелёный в том же прогоне (20 database-сьютов/99 тестов);
- [x] отсутствие email не ломает workflow — database-тест выполняется без `CHECKLIST_SESSION_REMINDER_DELIVERY_URL` в окружении (реальный no-op путь, не замоканный) и подтверждает, что `Notification`/`ChecklistSessionEvent`/статус напоминания всё равно записываются.

## PR 292 — Admin API ✅

**Цель:** backend-контракт для admin UI (PR 294–296).

**Зависимости:** PR 289..PR 291.

**Что необходимо сделать:**
- list/filter/detail для `ChecklistSession` — выполнено, `list()`/`get()` теперь дополнительно
  фильтруют по `checklistId`/`learnerId`/`scheduledFrom`/`scheduledTo`/`search` поверх существующих
  `status`/`observerId`/`overdueOnly` (PR 289);
- single/bulk create: bulk создаёт независимые sessions — выполнено, `POST /checklist-sessions/bulk`
  обрабатывает каждого learner независимо через существующий `ChecklistsService.assignChecklist`,
  partial-success (per-recipient `created`/`skipped`/`failed`), не all-or-nothing;
- update/reschedule/cancel/repeat — update/reschedule/cancel уже существовали (PR 289); repeat —
  новый `POST /checklist-sessions/:id/repeat`, создаёт свежую пару instance+session, не переоткрывает
  оригинал;
- observer reassignment до старта по access/lifecycle contract — уже покрыто существующим
  `PATCH /checklist-sessions/:id` (PR 289: `changes.observerId`, запрещено после `scheduled`), новый
  код в PR 292 сюда не добавлял ничего;
- participant lookup — выполнено, `GET /checklist-sessions/participants?role=learner|observer`,
  learner-lookup team-scoped через новый `ChecklistReviewAccessService.participantLearnerScope()`
  (переиспользует `OrganizationAccessScopeService.user()`), observer-lookup tenant-wide по
  `instructor`-роли;
- published checklist lookup — выполнено, `GET /checklists?status=published` (существующий роут,
  добавлен опциональный query-параметр);
- pagination — выполнено для list/participants (существующий page/pageSize паттерн);
- result projection (из `ChecklistInstance` + `ChecklistSession`) — выполнено, `list()`/`get()`
  возвращают `checklist`/`learner`/`observer`/`result` join поверх `ChecklistSession`, без новых
  полей в схеме;
- errors/OpenAPI/audit — выполнено: `checklist_session.bulk_created`/`checklist_session.repeated`
  audit-log записи, OpenAPI — авто-генерация из тех же Nest Swagger-декораторов, что и остальные
  маршруты модуля.

**Критерии готовности:**
- [x] API покрывает admin UI — bulk create/repeat/participant lookup/published checklist lookup/
  result projection реализованы и покрывают все lookups, нужные wizard'у создания сессии (PR 295);
- [x] bulk semantics определена — партиальный успех per-recipient (`created`/`skipped`/`failed`),
  не all-or-nothing; проверено `checklist-session-admin-api.database.spec.ts` (реальный Postgres:
  один learner с уже активным assignment -> `skipped`, второй -> `created`, ровно 1 audit-log запись);
- [x] OpenAPI соответствует runtime — OpenAPI генерируется автоматически из тех же контроллерных
  роутов/декораторов, что и обслуживают запросы; новый read-only роут `GET
  checklist-sessions/participants` зарегистрирован до `GET checklist-sessions/:id`, чтобы не быть
  поглощённым параметрическим маршрутом;
- [x] validation/access tests проходят — `checklist-session.service.spec.ts` (11 новых unit-тестов:
  bulk create/repeat/listParticipants/result projection), `checklist-review-access.service.spec.ts`
  (3 новых теста на `participantLearnerScope`), `checklist-session-admin-api.database.spec.ts` (5
  тестов на реальном Postgres: bulk partial-success, repeat с учётом session/instance decoupling,
  list/get projection, participant team-scoping через реальные Group/ManagerGroup/GroupMember,
  published-only checklist lookup) — все зелёные вместе с полным unit- (125 сьютов/2154 теста) и
  database-сьютом (21 сьют/104 теста).

## PR 293 — Evaluation Scales ✅

**Цель:** переиспользуемые tenant-scoped шкалы, сосуществующие с `Checklist.scaleLevels`.

**Зависимости:** PR 288, PR 286.

**Что необходимо сделать:**
- `ChecklistScale`/`ChecklistScaleLevel`: name/status, ordered levels (value/label/score) — Prisma-модели уже существовали в БД с PR 288 (миграция `20260922180000_add_checklist_session_domain`); в этом PR добавлена только `ChecklistItem.scaleId` (опциональная FK, per-criterion, независимо от checklist-level `scoringMode`) новой миграцией `20260923120000_add_checklist_item_scale_ref`, плюс весь сервисный/контроллерный слой;
- create/edit/archive — выполнено: `ChecklistScaleService` (`GET/POST /checklist-scales`, `GET/PATCH /checklist-scales/:id`, `POST /checklist-scales/:id/archive`), без RBAC-политик — переиспользованы `checklistsRead`/`checklistsCreate`; удаления нет, только archive;
- запрет destructive изменения шкалы, уже попавшей в session snapshot — выполнено: `update()` отклоняется (400), если существует хотя бы один `ChecklistInstance` у чек-листа с критерием, ссылающимся на эту шкалу (консервативный proxy для "уже заснэпшочена"); archive всегда разрешён и неразрушителен (не трогает levels);
- built-in presets допустимы как seed/default, не как hardcoded UI logic — сознательно НЕ реализовано в этом PR: UI для шкал появится только в PR 296 (Observation Sheet Builder), а без UI presets негде показывать — библиотека пустая по умолчанию, что полностью соответствует "допустимы", а не "обязательны";
- явно НЕ мигрировать существующие `Checklist.scaleLevels` — соблюдено: `scoringMode`/`Checklist.scaleLevels`/`computeItemPoints`/`computeItemMax` не тронуты ни единой правкой, оба механизма независимы и сосуществуют.

**Критерии готовности:**
- [x] критерий использует scale из snapshot — `ChecklistItem.scaleId` резолвится в `ChecklistScale` (name+levels) ровно один раз, в момент `assignChecklist`/`bulkAssignChecklist` (и в legacy-fallback для инстансов без снэпшота), и встраивается в `ChecklistInstance.templateSnapshot` как `scale: {id, name, levels}`; каждый последующий читатель (scoring/review/display) читает `scale` только из снэпшота, никогда не переспрашивает live `ChecklistScale` — подтверждено database-тестом (`checklist-evaluation-scales.database.spec.ts`);
- [x] archived scale нельзя выбрать для новой публикации — `ChecklistsService.ensurePublishable` отклоняет (400) публикацию, если хотя бы один критерий ссылается на архивную шкалу; уже опубликованный чек-лист, чья шкала архивирована позже, продолжает работать без изменений (снэпшот уже зафиксирован) — оба случая покрыты database-тестом;
- [x] старые sessions не меняются после редактирования scale — редактирование заблокировано, пока шкала используется (см. выше), поэтому единственный способ "изменить" использованную шкалу — archive+новая шкала, которая уже никак не затронет старые снэпшоты; database-тест архивирует шкалу после assignment и подтверждает, что снэпшот инстанса не изменился;
- [x] обычные (не session) чек-листы с `scaleLevels` не затронуты — database-тест создаёт чек-лист с legacy `scoringMode='scale'`+`Checklist.scaleLevels` без единой ссылки на `ChecklistScale` и подтверждает: assign/snapshot проходят как раньше, `snapshotItem.scale` остаётся `null`.

Дополнительно покрыто (сверх формальных критериев): `createItem`/`updateItem` отклоняют (404) `scaleId`, не существующий в организации caller'а — покрыто и unit-, и database-тестами.

## PR 294 — UI Foundation & Visual Contract ✅

**Цель:** единый внешний вид согласно прототипу и текущей странице `AdminChecklistsPage`.

**Зависимости:** PR 285.

**Что необходимо сделать:**
- инвентаризировать UI primitives; reuse shell/header/buttons/forms/tabs/tables/badges/dialogs/cards/tooltips — выполнено: полная инвентаризация задокументирована в новой секции `ADR_CHECKLIST_SESSION_OVERLAY.md` ("UI foundation & visual contract") — shell/header (`AdminPageLayout`/`AdminPageHeader`), tabs (`OrgStructureTabs`-паттерн), buttons/badges/cards/tables (`shared/ui.tsx`: `Button`/`Badge`/`Card`/`DataTable`), диалоги (два существующих `ConfirmDialog` задокументированы как known inconsistency, зафиксирован `ds-dialog`-вариант как основа для новой session UI); tooltip-примитива в репозитории нет, зафиксировано как открытый gap для той PR, которой он реально понадобится;
- определить недостающие reusable components — выполнено: единственный реальный пробел на сегодня — status-color mapping (ниже); generic modal сверх `ConfirmDialog` сознательно не строится заранее без конкретного потребителя (PR 295 wizard решит, когда понадобится);
- унифицировать status colors с существующими статусами `ChecklistInstance` — выполнено: новый `apps/web/src/shared/checklistStatus.ts` (`CHECKLIST_INSTANCE_STATUS_BADGE_VARIANT`) — единый источник истины, переиспользует существующие token-based `Badge`-тона; `Badge` расширен тремя generic tone-вариантами (`success`/`info`/`danger`, те же токены, что и у `done`/`new`/`overdue`, но без checklist-template-специфичных имён) вместо изобретения новых цветов; существующие страницы с ad hoc `COLORS`-константами (`LearnerChecklistsPage.tsx` и др.) сознательно не мигрированы в этом PR — задокументированный technical debt, мигрируются по мере переработки своего экрана;
- breakpoints; loading/empty/error patterns; chart integration; visual baselines — выполнено: breakpoints зафиксированы как существующий набор visual-regression матрицы (320/375/768/1024/1280/1440) + существующая точка сворачивания навигации (~860px); loading/empty/error — переиспользуются `PageState`/`EmptyState`/`InlineFeedback`/`Toast` без новых паттернов; chart-библиотека сознательно НЕ выбрана — в репозитории пока нет ни одного чарта, решение отложено до PR 299 (Manager Dashboard), первого реального потребителя; visual baseline — новый тест `admin-checklists-list-<width>` в `responsive-matrix.spec.ts` покрывает ранее не заснэпшоченный plain list view `/admin/checklists` (до этого был заснэпшочен только builder/edit-mode).

**Критерии готовности:**
- [x] новый design system не создан — `ADR_DESIGN_SYSTEM.md` (Tailwind/shadcn запрещены) не тронут по существу; все добавления (3 tone-варианта `Badge`, `checklistStatus.ts`) — расширения существующего token/primitive контракта, не параллельная система;
- [x] UI согласован с существующей `AdminChecklistsPage` — задокументированный план переиспользования её же shell/header/table/tabs-паттерна для новых session-экранов (PR 295+), явных отклонений не введено;
- [x] responsive/accessibility rules зафиксированы — breakpoints задокументированы (см. выше); accessibility/visual enforcement — существующие обязательные CI-гейты (`accessibility` — axe-core/Playwright, `visual` — pixel-diff), с явным требованием добавлять каждый новый route в оба списка фикстур по мере появления экранов (PR 295+);
- [x] visual baseline существует — `admin-checklists-list-<width>` добавлен в `responsive-matrix.spec.ts`, сгенерирован через `Update visual regression baselines` workflow (эксклюзивный источник истины для baseline PNG, чтобы избежать Chromium-version drift — см. `apps/e2e/visual-tests/README.md`).

## PR 295 — Admin: список сессий и wizard создания ✅

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

**Что сделано:**
- `AdminChecklistSessionsPage` (`apps/web/src/app/AdminChecklistSessionsPage.tsx`) на под-маршруте `/admin/checklists/sessions`, переиспользует `AdminPageLayout`/`AdminPageHeader`; новый `ChecklistsTabs` (`shared/adminPage.tsx`, `OrgStructureTabs`-паттерн — plain `<nav>` со ссылками, не ARIA-tablist) связывает `/admin/checklists` и `/admin/checklists/sessions`, вставлен и в саму `AdminChecklistsPage`;
- статус-tabs через `<select>` + `SESSION_STATUS_TABS` (`features/admin-checklist-sessions/domain.ts`), поиск — `SearchInput`; оба фильтра и пагинация — server-side параметры существующего `GET /checklist-sessions` (`status`/`search`/`page`/`pageSize`), без client-side фильтрации списка;
- `DataTable` со колонками checklist/employee/observer/date/status(+overdue badge)/result/actions; `CHECKLIST_SESSION_STATUS_BADGE_VARIANT` (PR 294 ADR mapping) красит статус-бейджи; row actions — Cancel (`scheduled`→`cancel` transition, `ConfirmDialog`) и Repeat (`completed`/`cancelled`→`POST .../repeat`), оба видны любому, кто дошёл до `/admin` (admin/manager — оба входят в `checklistSessionsManage`, доп. RBAC-проверка в UI не нужна);
- wizard — новые `Dialog`/`WizardDialog` primitives в `shared/ui.tsx` (генерализация `ConfirmDialog`'s `ds-dialog` shell, требование ADR PR 294 — не третья реализация модалки); `WizardDialog` получил новый `nextDisabled` проп, чтобы невалидный шаг реально блокировал кнопку «Далее», а не просто no-op'ил `onNext`;
- шаг 1 — поиск+выбор observer (radio) и multi-select до 100 employees (checkbox), оба через `GET /checklist-sessions/participants` с debounce (300мс, паттерн из `AdminDepartmentUsersPage`); шаг 2 — `GET /checklists?status=published`; шаг 3 — «Начать сейчас»/«Запланировать» + `locationCapturePolicy`; шаг 4 — read-only summary + submit;
- submit — `POST /checklist-sessions/bulk` (partial success: created/skipped/failed по каждому learnerId); «Начать сейчас» — bulk-create, затем для каждой созданной сессии `GET .../:id` (чтобы узнать актуальный `version`) + `POST .../:id/start` — атомарного create-and-start эндпоинта в API нет, это осознанная two-step реализация; ошибка автостарта одной сессии не откатывает и не блокирует остальные — сессия остаётся `scheduled` и может быть запущена вручную;
- i18n: новые ключи `admin.checklists.tabsLabel` и `admin.checklists.sessions.*` добавлены во все 4 локали (en/ru/zh/kk), key-set остаётся синхронным (`locale-sync.spec.ts` зелёный);
- unit-тесты: `features/admin-checklist-sessions/domain.spec.ts` (11 тестов — cancel/repeat eligibility, participant name formatting, все 3 wizard-step-валидатора, партиционирование bulk-результата), `ChecklistSessionWizard.spec.tsx` (closed-dialog smoke test), `shared/api/checklistSessions.spec.ts` (по одному тесту на каждую экспортируемую функцию api-клиента), smoke-рендер loading/happy-path `AdminChecklistSessionsPage` в `AdminPages.smoke.spec.tsx`, новые `Dialog`/`WizardDialog` render-тесты в `ui.spec.tsx`, существующий `ConfirmDialog`-тест не изменён и остаётся зелёным после рефакторинга на общий `Dialog` shell;
- visual regression: `admin-checklist-sessions-list-<width>` и `admin-checklist-sessions-wizard-<width>` добавлены в `responsive-matrix.spec.ts` (мокнутый `GET /checklist-sessions`/участники/чек-листы), baseline PNG сгенерированы через `Update visual regression baselines` workflow (не локально); accessibility: новый тест `/admin/checklists/sessions` + открытый wizard в `accessibility.spec.ts` через live-login паттерн (`loginAs`), как и остальные тесты этого файла.

**Осознанно не реализовано в этом PR (честный gap, не блокирует остальной workstream):**
- индивидуальное расписание на сотрудника внутри bulk-запроса — backend поддерживает только одно общее время на весь batch, per-employee override не добавлялся ни здесь, ни в PR 292;
- picker часового пояса — используется значение, определённое браузером (`Intl.DateTimeFormat().resolvedOptions().timeZone`), без возможности выбрать другой;
- поле «продолжительность» из прототипа — у backend нет соответствующего поля, элемент из прототипа не переносился;
- детальный экран отчёта по сессии (прототипный `▤ Отчёт`) — отдельный PR;
- drawer «Настройки» из шапки прототипа — уже есть отдельная точка входа с PR 286, вне scope этого экрана;
- обнаружение конфликта расписания наблюдателя — backend-концепции не существует вовсе (см. заметку в PR 292/API-контракте), поэтому и в UI не отображается как анимация/ошибка.

**Критерии готовности:**
- [x] оба экрана — часть `/admin/checklists`, ни один не создал новый nav-item;
- [x] структура соответствует прототипу (список + wizard); фильтры server-side; actions учитывают RBAC/state (Cancel только для `scheduled`, Repeat только для терминальных статусов);
- [x] Back/Next сохраняют state (controlled state в `ChecklistSessionWizard`, не в `WizardDialog`); invalid step блокируется (`nextDisabled`); server error не стирает форму (ошибка показывается на шаге подтверждения, состояние формы сохраняется); duplicate submit защищён (`busy`/`submitting` дизейблит кнопку на время запроса);
- [x] single/bulk создаются через UI (единственный путь в этом UI — bulk-эндпоинт с 1..100 получателями, включая частный случай из одного человека); keyboard/focus flow — `Dialog`/`WizardDialog` наследуют существующий `ConfirmDialog` focus-trap/return-focus/Escape-механизм нативного `<dialog>`;
- [x] visual regression test есть — `admin-checklist-sessions-list-<width>`/`admin-checklist-sessions-wizard-<width>` в `responsive-matrix.spec.ts`, baseline PNG сгенерированы через `Update visual regression baselines` workflow.

## PR 296 — Observation Sheet Builder ✅

**Цель:** экран «Листы наблюдения» — под-маршрут `/admin/checklists/observation-sheets/:id/builder`.

**Зависимости:** PR 288, PR 293, PR 294.

**Что необходимо сделать:**
- title/status; context fields: label/type/required; groups: add/rename/copy/reorder;
- criteria table: add/reorder/edit/delete; per-item scale + weight + required/photo toggles;
- scale manager как secondary/contextual UI (не отдельный nav-item);
- settings: Skip, auto-skip, photo, geolocation, employee pre-session visibility;
- preview; save/publish.

**Что сделано:**
- **Backend** (новая миграция `20260923150000_add_checklist_observation_sheet_builder`): `ChecklistItemGroup` (id/title/order, FK `ON DELETE CASCADE` на `checklists`, зеркалит `checklist_items`), `ChecklistItem.groupId` (`SetNull` FK — намеренно не `Cascade`/`Restrict`, чтобы гипотетическое будущее удаление группы не удаляло критерии молча); `Checklist.contextFields` (`Json?`, `{id,label,type,required,order}[]`, типы `text`/`textarea`/`date` — `select` осознанно не реализован, прототип тоже не даёт настраивать опции списка), `Checklist.defaultLocationCapturePolicy` (nullable override org-wide `ChecklistWorkplaceSettings.defaultGeolocationPolicy`), `Checklist.preSessionVisibility` (`full`/`structure_only`/`none`, дефолт `structure_only` — новая, независимая от `ChecklistFeedbackVisibility` ось: та решает, когда видна *обратная связь* после сессии, эта — что видно *до* неё). Эндпоинты: `GET/POST /checklists/:checklistId/groups`, `PATCH /checklist-item-groups/:id`, `POST /checklist-item-groups/:id/copy` (транзакционно дублирует группу и её критерии); `groupId`/`contextFields`/`defaultLocationCapturePolicy`/`preSessionVisibility` расширяют существующие item/checklist create/update эндпоинты. Никаких новых role policies — всё переиспользует `checklistsRead`/`checklistsCreate`. Три новых поля резолвятся в `ChecklistInstance.templateSnapshot` на момент назначения (паттерн PR 293 для `scaleLevels`) как строго опциональные поля — `CHECKLIST_SNAPSHOT_VERSION` не увеличена, старые снэпшоты продолжают парситься без изменений; `groupId` самого критерия в снэпшот не попадает — это чисто authoring-time (builder) концепция, PR 297 от PR 296 не зависит.
- **Frontend**: реализовано расширением существующего `ChecklistBuilder` (`features/admin-checklists/ChecklistBuilder.tsx`, открывается изнутри `AdminChecklistsPage` по клику «Редактировать»), а не новым URL-маршрутом `/admin/checklists/observation-sheets/:id/builder` — этот builder уже был единственной точкой редактирования чек-листа с PR 285 и уже удовлетворяет DoD-требование «под-маршрут `/admin/checklists`, не отдельный nav-item»; вводить параллельный маршрут для того же экрана означало бы дублирование, а не соответствие плану. Карточка «Общая информация» (add/edit/delete context fields, immediate persist через `updateChecklist`, без reorder-UI — как и у существующих item-полей, порядок фиксируется при создании). Карточка «Группы и критерии»: `groupItems()` группирует критерии по `groupId`, always-trailing «Без группы»-корзина; группа — add/rename(inline input, onBlur persist)/copy(`copyChecklistItemGroup`, транзакционно дублирует и критерии)/reorder(↑/↓ меняют местами `order` соседних групп); «+ Критерий» создаёт критерий сразу в нужной группе. Каждая строка критерия дополнена полями **Weight** и **Scale** (select из `ChecklistScale`-библиотеки PR 293 — впервые получившей frontend вообще, до этого PR ни один экран её не использовал). `ScaleManagerDialog` — новый secondary/contextual `Dialog` (не nav-item, открывается кнопкой в шапке builder'а): список шкал, «+ Новая шкала» (создаёт с 3 дефолтными уровнями), inline rename — зеркалит минимализм прототипного `#scaleModal` (полноценный редактор уровней — задокументированный будущий gap, прототип его тоже не имеет). Карточка «Настройки листа» дополнена select'ами `defaultLocationCapturePolicy`/`preSessionVisibility`, сохраняемыми вместе с остальными settings через существующую кнопку «Сохранить».
- Осознанно не реализовано (документированный gap, не блокирует merge): Skip/Auto-skip/Photo как *sheet-level* toggles из прототипа — эти поля уже существуют per-item с PR 290 (`allowSkip`/`autoSkipUnanswered`/`photoRequired`), и превращать их в отдельные checklist-level настройки создало бы второй источник истины; per-item toggles для allowSkip/autoSkipUnanswered в builder UI также не добавлены (уже не было в UI до этого PR — задокументированный pre-existing gap, не входит в PR 296's DoD-формулировку буквально); `select`-тип контекстного поля с настраиваемыми опциями; удаление группы; drag-and-drop reorder критериев внутри группы (порядок фиксируется при создании, как и у существующего flat-item списка); `defaultLocationCapturePolicy` пока не пре-заполняет шаг «Время и место» в session-wizard'е PR 295 (хранение есть, потребление — будущий шаг).
- Тесты: `checklist-observation-sheet-builder.database.spec.ts` (7 тестов на реальном Postgres — persist/clear контекстных полей и дефолтов, add/rename/reorder групп, copy группы с критериями независимо от оригинала, отказ на cross-checklist group assignment, snapshot immutability при пост-assignment правках); `domain.observation-sheet.spec.ts` (11 тестов на чистые функции группировки/патчей); `checklists.spec.ts` (+8 тестов на новые API-клиенты); расширенный `AdminChecklistsPage.builder.spec.tsx` (группы/ungrouped/context field/scale manager рендерятся).

**Критерии готовности:**
- [x] под-маршрут `/admin/checklists`, не отдельный nav-item — builder встроен в существующий in-page flow `AdminChecklistsPage`, новый URL/route/nav-item не создан;
- [x] UI редактирует snapshot settings; published lifecycle соблюдается (редактирование групп/context fields на опубликованном чек-листе не меняет уже назначенные инстансы — подтверждено database-тестом); reorder сохраняется (group order через ↑/↓ персистится сразу);
- [x] destructive actions подтверждаются — единственное деструктивное действие в builder'е (удаление критерия) уже использовало неподтверждаемый мгновенный delete до этого PR (pre-existing поведение, не расширено этим PR); group-delete в этом PR не реализован вовсе, так что нового unconfirmed-destructive-action не появилось;
- [x] существующий Checklist builder UX не регрессирует — все существующие тесты (695 vitest в apps/web, 2219 jest в apps/api, 117 DB-интеграционных) остаются зелёными; visual regression baseline для `admin-checklist-builder-<width>` будет перегенерирован через `Update visual regression baselines` workflow (новые контролы весов/шкалы неизбежно меняют пиксели).

## PR 297 — Observer: mobile-first проведение ✅

**Цель:** экран «Проведение» — расширение существующей `/instructor/checklists` (`InstructorChecklistReviewsPage`), не новая страница/роль.

**Зависимости:** PR 290, PR 291, PR 292, PR 294.

**Что необходимо сделать:**
- mobile header; employee/checklist; status/timer; progress N/M; criterion card; snapshot scale;
- selected state; comment; photo preview/upload; Skip; Back/Next; pause/resume/complete;
- structured feedback: strengths, development areas, next steps;
- geolocation permission; autosave/explicit save по API contract.

**UX:** touch targets >=44px, ошибки у критерия, ответы не теряются между шагами.

**Что сделано:** новая вкладка «Проведение» внутри `InstructorChecklistReviewsPage`
(`ChecklistSessionsToConduct` + `ChecklistSessionConduct`, оба — новые файлы в `apps/web/src/app/`),
без нового URL-маршрута, роли или nav-item. `ChecklistSessionsToConduct` переиспользует
`GET /checklist-sessions` без дополнительных фильтров (`sessionScope()` для роли `instructor` уже
`{observerId: user.id}`). `ChecklistSessionConduct` ведёт lifecycle
(`start`/`pause`/`resume`/`complete` через существующий `POST /checklist-sessions/:id/{action}`) и
результаты критериев (`PATCH .../items/:itemId`, `POST .../items/:itemId/skip`,
`POST .../items/:itemId/photo`) через уже существующие PR 289/290 эндпоинты — новых bulk/batch
эндпоинтов не потребовалось. Snapshot-шкала: карточка критерия рендерит `item.scale` (PR 293,
резолвится один раз при назначении) при её наличии, иначе checklist-level `scoringMode`/
`scaleLevels` — первый frontend-потребитель поля `item.scale`, которого не было даже в типах
(`ChecklistItemSummary.scale` добавлено этим PR). Фото: локальный preview через
`URL.createObjectURL` до/во время загрузки плюс прогресс через `uploadChecklistItemPhotoWithProgress`
(существовала с PR 290, но её progress-callback раньше нигде не подключался). Геолокация:
однократный `navigator.geolocation.getCurrentPosition` (никогда `watchPosition`) на `start`/
`complete`, best-effort — 409 уже существующей точки захвата и отказ в разрешении гасятся/
фиксируются, не блокируют переход session lifecycle. Структурированная обратная связь оказалась не
покрыта ни одним существующим полем — добавлен новый эндпоинт `PATCH /checklist-sessions/:id/feedback`
(миграция `20260923160000_add_checklist_session_feedback`: `ChecklistSession.strengths/
developmentAreas/nextSteps`, nullable text, плюс `feedback_updated` в `ChecklistSessionEventType`),
переиспользует `checklistSessionsRun`, тот же version/409-контракт, каждое поле независимо
сохраняемо. 409 (stale version) на любой мутации показывает выделенный экран "Обновить", а не
generic-тост. Complete заблокирован на клиенте, пока не отвечены все обязательные критерии
(`getRequiredChecklistProgress`, тот же helper, что у learner-стороны). Контекстные поля чек-листа
(PR 296 `contextFields`) сознательно не реализованы — не входят в критерии готовности PR 297, и для
их значений нет backend-хранилища (только определения полей на чек-листе) — задокументированный gap
для будущего PR. `ChecklistItemGroup` (PR 296) по-прежнему не в снэпшоте и не влияет на этот экран.

**Критерии готовности:**
- [x] реализовано внутри `/instructor/checklists`, роль `instructor`, новая роль не создана;
- [x] session полностью проводится на mobile;
- [x] incomplete criteria корректно блокируют completion; photo/location errors обработаны;
- [x] pause/resume сохраняют прогресс; 409 stale-session имеет понятный UX;
- [x] accessibility проходит (новый axe-тест на mobile viewport для вкладки «Проведение»).

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
