# Migration and Backup Policy

> **Статус:** `CURRENT`
>
> **Назначение:** описать current migration behavior, требования к compatibility/rollback и отдельно обозначить, что backup/PITR/restore state требует live verification.
>
> **Проверено по `main`:** `bd602622a4647f825cf5f5bc3bf10f663940c0a5` (2026-08-09).

## 1. Migration source of truth

**Статус:** `IMPLEMENTED`

Prisma schema/migrations являются current source of truth для database schema evolution.

Current CI проверяет migration replay на PostgreSQL service, а Railway API startup выполняет:

```text
prisma migrate deploy
```

перед запуском приложения.

---

## 2. Current deployment migration model

**Статус:** `IMPLEMENTED`

Production-style Railway deploy использует automatic forward migration application при API startup.

Следовательно старое правило «production migrations выполняются только вручную отдельной командой» больше не является current behavior.

### Important boundary

Automatic `prisma migrate deploy`:

- применяет pending forward migrations;
- не создаёт автоматический reverse migration;
- не гарантирует rollback данных;
- не заменяет compatibility/backup planning для risky changes.

---

## 3. Safe migration requirements

Для non-trivial schema/data changes задача должна определить:

- backward/forward compatibility;
- impact на old/new application version overlap;
- data migration/backfill order;
- expected locks/downtime risk;
- rollback или forward-fix strategy;
- backup/restore requirement;
- verification query/test plan.

Destructive или production data migration требует отдельного подтверждения согласно project safety policy.

---

## 4. CI migration checks

**Статус:** `CONFIGURED` + `EXECUTED`

CI выполняет migration/integration checks на clean/test PostgreSQL instance.

Это подтверждает, что migrations применимы к CI test database, но **не является** полноценным rehearsal upgrade реальной production dataset/history.

Если migration зависит от существующих данных, нужен отдельный data-specific validation plan.

### Org structure foundation migration

Migration `20260829120000_add_org_structure_foundation` классифицирована как additive и backward-compatible:

- создаёт новые enum types и таблицы `department_types`, `departments`, `org_structure_events` без backfill существующих данных;
- не переименовывает и не изменяет данные `Group`, `GroupMember` или `ManagerGroup`;
- добавляет к `users` только составной unique index `(id, organization_id)`, необходимый для tenant-safe actor relation;
- допускает overlap с предыдущей версией приложения: старый application revision не использует новые таблицы;
- при application rollback новые неиспользуемые объекты остаются в БД, а дальнейшее исправление выполняется forward-fix вместо destructive rollback.

Перед production deploy нужно учитывать, что обычный `CREATE UNIQUE INDEX` может временно конкурировать с записью в `users`. После deploy следует проверить статус Prisma migration и наличие новых constraints/indexes; отдельный data backfill или специальный backup сверх общей policy для этой additive migration не требуется. Live backup/PITR state по-прежнему остаётся `LIVE-VERIFY`.

### Department membership migration

Migration `20260829130000_add_department_membership` также additive и backward-compatible:

- создаёт только новую таблицу `department_memberships` (историческая user↔department relation, PR 271) без изменения существующих таблиц `departments`, `users` или `org_structure_events`;
- не выполняет backfill: существующие `User` не получают ни одной строки membership автоматически (per plan invariant "existing Users автоматически не распределяются");
- два partial unique index (`department_memberships_current_primary_user_key`, `department_memberships_current_user_department_key`) заданы вручную raw SQL в migration.sql — как и `departments_org_code_key` из предыдущей миграции, Prisma schema DSL не поддерживает `WHERE`-условие в `@@unique`, поэтому эти constraints намеренно отсутствуют в `schema.prisma` (задокументированное расхождение, не drift);
- допускает overlap со старой версией приложения аналогично org-structure-foundation migration.

Отдельный data backfill или backup сверх общей policy не требуется.

### Department manager migration

Migration `20260830090000_add_department_manager` также additive и backward-compatible:

- создаёт новый enum `DepartmentManagerType` и новую таблицу `department_managers` (структурные/функциональные руководители подразделения с вычисляемым наследованием, PR 272) без изменения существующих таблиц `departments`, `department_memberships`, `users` или `org_structure_events`; поля `direct_manager_mode`/`functional_manager_mode` на `departments` уже существовали с миграции org-structure-foundation, эта миграция их не трогает;
- не выполняет backfill: ни один Department не получает менеджеров автоматически;
- два partial unique index (`department_managers_current_department_user_type_key`, `department_managers_current_primary_type_key`) заданы вручную raw SQL в migration.sql по той же причине, что и для `department_memberships` и `departments_org_code_key` — Prisma schema DSL не поддерживает `WHERE`-условие в `@@unique`, поэтому эти constraints намеренно отсутствуют в `schema.prisma`;
- допускает overlap со старой версией приложения аналогично предыдущим org-structure миграциям.

Отдельный data backfill или backup сверх общей policy не требуется.

### Position migration

Migration `20260830160000_add_position` также additive и backward-compatible:

- создаёт новый enum `PositionStatus` и новую таблицу `positions` (tenant-scoped каталог должностей, PR 275) с `UNIQUE(organizationId, code)` и индексом по `(organizationId, status)`;
- добавляет nullable колонку `position_id` в существующую таблицу `department_memberships` с FK `ON DELETE NO ACTION` на `positions` (та же схема, что и `Department.departmentType` — Position архивируется, а не удаляется, поэтому hard delete недостижим и `NO ACTION` не может сработать) и индекс `(organizationId, positionId)`; существующие строки `department_memberships` получают `position_id = NULL`, backfill не выполняется;
- не трогает `User.position` (legacy текстовое поле остаётся нетронутым, вынесено в отдельный PR 276);
- допускает overlap со старой версией приложения аналогично предыдущим org-structure миграциям.

Отдельный data backfill или backup сверх общей policy не требуется.

### Learning targets migration

Migration `20260831090000_add_learning_targets` также additive и backward-compatible, с одним важным нюансом — она **удаляет и заменяет** старый CHECK constraint:

- добавляет nullable колонку `department_id` и `include_descendants BOOLEAN NOT NULL DEFAULT false` в существующую таблицу `assignments` (PR 277), с FK `(department_id, organization_id) -> departments(id, organization_id) ON DELETE NO ACTION` и индексом `(organization_id, department_id)`; существующие строки получают `department_id = NULL`, `include_descendants = false` — backfill не требуется, семантика не меняется для уже существующих user/group-назначений;
- **удаляет** constraint `assignments_single_target_check` (создан ещё в исходной `20260526090000_add_assignments`, требовал ровно одного из `user_id`/`group_id` и отклонил бы любую department-only строку) и заменяет его на `assignments_exactly_one_target_check` (`num_nonnulls(user_id, group_id, department_id) = 1`) — эквивалентен старому для всех существующих строк (department_id у них NULL), но дополнительно разрешает department-only target; добавляет также `assignments_include_descendants_requires_department_check` (`department_id IS NOT NULL OR include_descendants = false`);
- создаёт новый enum `PositionCourseRequirement` (`REQUIRED`/`OPTIONAL`) и новую таблицу `position_courses` (position-to-course requirement каталог, PR 277) с `UNIQUE(organizationId, positionId, courseId)`, CHECK на `due_days` (0..3650) и индексами по `(organizationId, status)`/`courseId`; переиспользует существующий `PositionStatus` enum вместо нового;
- не создаёт и не удаляет ни одной `Position`/`Course`/`Assignment` строки — чисто additive DDL;
- допускает overlap со старой версией приложения: старая версия просто не знает о новых колонках/таблице и продолжает работать с user/group-таргетингом как раньше; после отката приложения (без отката миграции) новые колонки остаются неиспользуемыми, но безвредными.

Отдельный data backfill не требуется. Backup сверх общей policy не требуется, но перед применением в production рекомендуется подтвердить через `SELECT count(*) FROM assignments WHERE num_nonnulls(user_id, group_id) != 1` (должно быть 0), что constraint drop+recreate безопасен для текущих данных.

### Reporting line migration

Migration `20260902090000_add_reporting_lines` также additive и backward-compatible:

- создаёт новый enum `ReportingLineType` (`DIRECT`/`FUNCTIONAL`/`PROJECT`) и новую таблицу `reporting_lines` (персональные линии подчинения отдельно от Department tree, PR 279) без изменения существующих таблиц `departments`, `department_managers`, `department_memberships`, `users` или `org_structure_events`;
- не выполняет backfill: ни один User не получает personal reporting line автоматически;
- CHECK `reporting_lines_employee_not_manager_check` (`employee_id <> manager_id`) и два partial unique index (`reporting_lines_current_employee_manager_type_key`, `reporting_lines_current_primary_type_key`) заданы вручную raw SQL в migration.sql по той же причине, что и для `department_managers`/`department_memberships`/`departments_org_code_key` — Prisma schema DSL не поддерживает `WHERE`-условие в `@@unique`, поэтому эти constraints намеренно отсутствуют в `schema.prisma`; DIRECT-цикл (A подчиняется B, B подчиняется A) не может быть выражен DB-constraint-ом и проверяется в приложении внутри Serializable-транзакции с bounded retry (`ReportingLinesService.createReportingLine`), тот же паттерн, что и cycle-check при reparent Department (PR 269);
- допускает overlap со старой версией приложения аналогично предыдущим org-structure миграциям.

Отдельный data backfill или backup сверх общей policy не требуется.

### Organization structure import preview migration

Migration `20260902120000_add_org_structure_import_previews` также additive и backward-compatible:

- создаёт новую таблицу `org_structure_import_previews` (server-owned snapshot CSV import payload для PR 280) без изменения существующих таблиц `departments`, `department_managers`, `department_memberships`, `positions`, `users` или `org_structure_events`;
- не выполняет backfill: строки появляются только когда admin инициирует CSV preview;
- хранит только SHA-256 hash одноразового токена (`token_hash`, `UNIQUE`) — сырой токен и сырой CSV нигде не персистятся; `payload` содержит только нормализованный, уже провалидированный набор строк, а не исходный файл;
- `expires_at`/`consumed_at` реализуют 30-минутный TTL и однократное potребление; истёкшие/потреблённые строки не удаляются миграцией автоматически — очистка stale preview-строк является операционной задачей, а не migration concern;
- допускает overlap со старой версией приложения аналогично предыдущим org-structure миграциям.

Отдельный data backfill или backup сверх общей policy не требуется.

### Organization external reference migration

Migration `20260903120000_add_org_external_references` также additive и backward-compatible:

- создаёт новый enum `OrgExternalReferenceEntityType` (`DEPARTMENT`/`DEPARTMENT_TYPE`/`POSITION`) и новую таблицу `org_external_references` (readiness для будущей HRIS/SCIM интеграции, PR 283) без изменения существующих таблиц `departments`, `department_types`, `positions`, `users` или `org_structure_events`;
- не выполняет backfill: ни одна internal entity не получает external mapping автоматически;
- уникальный индекс `org_external_references_org_source_type_external_key` на (`organization_id`, `source_system`, `entity_type`, `external_id`) — обычный (не partial) unique constraint, поскольку в отличие от `department_managers`/`department_memberships`/`reporting_lines` здесь нет понятия "текущей" записи: mapping не закрывается и не заменяется, только удаляется явно, поэтому Prisma schema DSL `@@unique` полностью выражает это ограничение без raw SQL;
- `entity_id` намеренно не является foreign key ни на одну из трёх таблиц (полиморфная связь по `entity_type`, тот же паттерн, что и у `org_structure_events.entity_id`) — internal UUID остаётся canonical primary key everywhere else, и эта таблица никогда не является FK-целью для других таблиц;
- архивирование `Department`/`Position` (`status`) или `DepartmentType` (`is_active`) не удаляет и не изменяет existing mapping — mapping history сохраняется независимо от текущего статуса internal entity;
- допускает overlap со старой версией приложения аналогично предыдущим org-structure миграциям.

Отдельный data backfill или backup сверх общей policy не требуется.

### Checklist workplace settings migration

Migration `20260922150000_add_checklist_workplace_settings` также additive и backward-compatible:

- создаёт два новых enum (`ChecklistGeolocationPolicy`, `ChecklistFeedbackVisibility`) и новую таблицу `checklist_workplace_settings` (tenant-scoped конфигурация для планируемого режима "session" Checklist-модуля, `docs/product/future/CHECKLIST_WORKPLACE_TRAINING_IMPLEMENTATION_PLAN.md` PR 286) без изменения существующих таблиц `checklists`, `checklist_items`, `checklist_instances` или любой другой существующей таблицы;
- не выполняет backfill: ни одна Organization не получает строку настроек автоматически — сервис (`ChecklistWorkplaceSettingsService`) читает документированные safe defaults для tenant без собственной строки и создаёт строку только при первом `PATCH`, тот же ленивый паттерн, что и `organization_themes`;
- `organization_id` — обычный (не partial) unique constraint на 1:1 связь с `organizations`, выражен прямо в Prisma DSL (`@unique`), raw SQL не требуется — здесь нет понятия "текущей" записи, как в `department_managers`/`reporting_lines`;
- допускает overlap со старой версией приложения: старая версия просто не знает о новой таблице/эндпоинте и продолжает работать без неё.

Отдельный data backfill или backup сверх общей policy не требуется.

### Checklist session domain migration

Migration `20260922180000_add_checklist_session_domain` также additive и backward-compatible:

- создаёт семь новых enum (`ChecklistSessionStatus`, `ChecklistSessionEventType`, `ChecklistSessionReminderType`, `ChecklistSessionReminderStatus`, `ChecklistLocationCapturePoint`, `ChecklistLocationCaptureStatus`, `ChecklistScaleStatus`) и семь новых таблиц (`checklist_sessions`, `checklist_session_events`, `checklist_score_revisions`, `checklist_session_reminders`, `checklist_location_captures`, `checklist_scales`, `checklist_scale_levels`) — domain model для workplace-training режима "session" (`docs/product/future/CHECKLIST_WORKPLACE_TRAINING_IMPLEMENTATION_PLAN.md` PR 288, `docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md`);
- добавляет три nullable-с-default колонки в существующую таблицу `checklist_items` (`weight INTEGER DEFAULT 1`, `allow_skip BOOLEAN DEFAULT false`, `auto_skip_unanswered BOOLEAN DEFAULT false`) — существующие строки получают safe defaults, backfill не требуется, ни одна из трёх не дублирует уже существующие `is_required`/`photo_required` (разные концепции: `allowSkip` — можно ли explicitly пропустить критерий во время сессии, а не обязателен ли он к заполнению для обычной сдачи);
- `checklist_sessions.instance_id` — обычный (не partial) unique FK на `checklist_instances`, обеспечивающий истинный 1:1 overlay (создать вторую session на тот же instance невозможно на уровне БД, не только в сервисе);
- `checklist_session_reminders` и `checklist_location_captures` используют обычные (не partial) составные unique-индексы — `(session_id, reminder_type)` и `(session_id, capture_point)` соответственно — как DB-level idempotency guardrail: at most один pre-start/incomplete-after-start reminder и at most одна start/end геолокация на сессию, независимо от того, сколько раз worker или клиент повторит запрос; raw SQL не требуется, поскольку (в отличие от `department_managers`/`reporting_lines`) здесь нет понятия "текущей активной" записи, которую нужно закрыть перед новой — это простые plain unique constraints, полностью выразимые в Prisma DSL;
- `checklist_scale_levels` имеет `UNIQUE(scale_id, value)`, запрещающий дублирующееся значение уровня внутри одной шкалы;
- не выполняет backfill ни для одной новой таблицы: ни одна `ChecklistInstance` не получает `ChecklistSession` автоматически — session создаётся только явно через будущий admin API (PR 292);
- не трогает существующие поля `ChecklistInstance` (`totalScore`/`maxScore`/`percentage`/`passed`/`templateSnapshot`/`snapshotVersion`/`status`) — счёт и статус сдачи остаются исключительно там; `checklist_score_revisions` — только append-only audit trail до/после, не второй источник истины текущего счёта;
- допускает overlap со старой версией приложения: старая версия просто не знает о новых таблицах/колонках и продолжает работать как раньше.

Все семь новых таблиц и три новые колонки применены к реальному локальному PostgreSQL 16 и проверены на нулевой дрейф (`prisma migrate diff --from-migrations ... --to-schema-datamodel ...` не показывает ни одной из новых таблиц/колонок в diff), плюс отдельный integration-тест (`checklist-session-domain.database.spec.ts`) подтверждает все перечисленные unique/cascade-инварианты на реальной БД, а не только валидность синтаксиса миграции.

Отдельный data backfill или backup сверх общей policy не требуется.

### Checklist scoring v1 migration

Migration `20260923040000_add_checklist_scoring_v1` также additive и backward-compatible (PR 290, `docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md` scoring v1):

- создаёт новый enum `ChecklistAnswerState` (`unanswered`/`answered`/`skipped`) и добавляет колонку `checklist_item_results.answer_state` с `DEFAULT 'unanswered'` — существующие строки (все ответы, отправленные до PR 290) автоматически получают `unanswered`, что затем немедленно переопределяется первым же `recomputeInstance()` на `answered`/`skipped` по факту существующих `checked`/`scaleLevel`; backfill не требуется, поле не участвует в вычислении score задним числом для уже завершённых `ChecklistInstance` (их `percentage`/`passed` не пересчитываются повторно);
- добавляет колонку `checklist_instances.scored BOOLEAN NOT NULL DEFAULT true` — существующие инстансы (ни один из которых физически не мог иметь skip до PR 290) остаются `scored=true`, что сохраняет их текущий `percentage` как есть, без искажения истории;
- добавляет значение `location_override` в существующий enum `ChecklistSessionEventType` (`ALTER TYPE ... ADD VALUE`) для аудита случая, когда админ подтверждает геолокацию за наблюдателя при policy `required`;
- не трогает ни одну существующую колонку и не переименовывает ничего — старая версия приложения продолжает работать, просто не зная о новом enum-значении `skipped`/`answer_state`/`scored` (Prisma-клиент старой версии их не читает и не пишет, а PostgreSQL хранит их как есть).

Применено к реальному локальному PostgreSQL 16 и проверено на нулевой дрейф тем же способом, что и предыдущие миграции этого модуля; `checklist-scoring-v1.database.spec.ts` подтверждает skip/weight/not_scored-инварианты и уникальность геолокационного захвата через сервисный слой на реальной БД.

Отдельный data backfill или backup сверх общей policy не требуется.

### Checklist item scale reference migration

Migration `20260923120000_add_checklist_item_scale_ref` также additive и backward-compatible (PR 293, `docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md`):

- добавляет одну nullable колонку `checklist_items.scale_id UUID` (без `DEFAULT`) и FK `ON DELETE RESTRICT ON UPDATE CASCADE` на уже существующую с PR 288 таблицу `checklist_scales`, плюс обычный (не partial) индекс `checklist_items_scale_id_idx`; не трогает ни одну другую колонку `checklist_items` и ни одну другую таблицу;
- существующие строки `checklist_items` получают `scale_id = NULL` — backfill не требуется и невозможен (нет способа автоматически сопоставить существующий критерий с одной из будущих переиспользуемых шкал);
- `RESTRICT` здесь не является реальным operational risk: `ChecklistScale` не имеет и не будет иметь endpoint физического удаления (`ChecklistScaleService` — только create/update/archive), поэтому эта FK-политика на практике никогда не блокирует удаление;
- допускает overlap со старой версией приложения: старая версия просто не знает о новой колонке и продолжает работать с критериями как раньше.

Миграция написана вручную (`prisma migrate dev` недоступен в non-interactive sandbox-окружении этой сессии) и проверена на нулевой дрейф через `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <fresh empty db>`, реплеирующий полную историю миграций в чистую shadow-БД перед сравнением со schema.prisma — вывод содержал ровно три ожидаемых DDL-оператора (`ADD COLUMN`, `CREATE INDEX`, `ADD CONSTRAINT`) и ничего больше; применено к реальному локальному PostgreSQL 16 (`prisma migrate deploy`), `checklist-evaluation-scales.database.spec.ts` подтверждает FK/immutability-инварианты через сервисный слой на реальной БД.

Отдельный data backfill или backup сверх общей policy не требуется.

### Observation sheet builder migration

Migration `20260923150000_add_checklist_observation_sheet_builder` также additive и backward-compatible (PR 296, `docs/product/future/CHECKLIST_WORKPLACE_TRAINING_IMPLEMENTATION_PLAN.md`):

- `checklists`: три новые колонки — `context_fields JSONB` (nullable, без `DEFAULT`), `default_location_capture_policy` (nullable enum `ChecklistGeolocationPolicy`, уже существующий с PR 289/290), `pre_session_visibility` (новый enum `ChecklistPreSessionVisibility`, `NOT NULL DEFAULT 'structure_only'` — безопасный дефолт, скрывающий прошлую обратную связь до явного решения администратора, аналогично `off`/`after_completion` дефолтам PR 286); ни одна существующая колонка не изменена;
- новая таблица `checklist_item_groups` (id/organization_id/checklist_id/title/order + timestamps), FK на `organizations`/`checklists` (`ON DELETE CASCADE`, зеркалит существующий паттерн `checklist_items`), два обычных индекса; не имеет endpoint удаления группы в этом PR (только add/rename/reorder/copy), поэтому пустая таблица никогда не блокирует ничего;
- `checklist_items` получает одну nullable колонку `group_id UUID` (без `DEFAULT`) и FK `ON DELETE SET NULL ON UPDATE CASCADE` на `checklist_item_groups` — `SetNull`, а не `Cascade`/`Restrict`, специально выбран так, чтобы гипотетическое будущее удаление группы никогда не удаляло криterii молча; существующие строки получают `group_id = NULL` — backfill не требуется (группы — новая концепция, у старых критериев их не было и не может быть);
- `CHECKLIST_SNAPSHOT_VERSION` **не увеличена** — `contextFields`/`defaultLocationCapturePolicy`/`preSessionVisibility` добавлены в `ChecklistRuntime`/`toRuntimeChecklist()` как строго опциональные поля; `parseTemplateSnapshot()`'s runtime-валидатор не требует их присутствия, поэтому существующие (созданные до PR 296) `templateSnapshot`-снэпшоты продолжают парситься как валидные без каких-либо изменений;
- допускает overlap со старой версией приложения: старая версия просто не знает о новых колонках/таблице и продолжает работать с чек-листами как раньше.

Миграция написана вручную (`prisma migrate dev` недоступен в non-interactive sandbox-окружении этой сессии) и проверена на нулевой дрейф через `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <fresh empty db>`, реплеирующий полную историю миграций в чистую shadow-БД перед сравнением со schema.prisma — после применения миграции вывод совпадает byte-for-byte с тем же (167-строчным, предсуществующим, не связанным с этим PR — тем же, что задокументирован выше для PR 293) baseline-дрейфом, подтверждённым отдельным прогоном diff без миграции; применено к реальному локальному PostgreSQL 16 (`psql -f migration.sql` + ручная запись в `_prisma_migrations`), `checklist-observation-sheet-builder.database.spec.ts` подтверждает group CRUD/copy, FK cross-checklist rejection и snapshot-immutability инварианты через сервисный слой на реальной БД.

Отдельный data backfill или backup сверх общей policy не требуется.

### Session structured-feedback migration

Migration `20260923160000_add_checklist_session_feedback` также additive и backward-compatible (PR 297, наблюдатель на мобильном):

- `checklist_sessions`: три новые nullable колонки без `DEFAULT` — `strengths TEXT`, `development_areas TEXT`, `next_steps TEXT`; ни одна существующая колонка не изменена;
- `ChecklistSessionEventType` получает новое значение `feedback_updated` (`ALTER TYPE ... ADD VALUE`) — не используется в той же транзакции, что и его добавление, поэтому совместимо с обёрткой миграции в транзакцию;
- существующие строки `checklist_sessions` получают `strengths/development_areas/next_steps = NULL` — backfill не требуется (структурированная обратная связь — новая концепция для существующих сессий);
- допускает overlap со старой версией приложения: старая версия просто не знает о новых колонках/enum-значении и продолжает работать с сессиями как раньше.

Миграция написана вручную (`prisma migrate dev` недоступен в non-interactive sandbox-окружении этой сессии) и проверена на нулевой дрейф через `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <fresh empty db>` — вывод байт-в-байт совпадает с тем же предсуществующим (110-строчным на момент этой проверки), не связанным с этим PR baseline-дрейфом, подтверждённым отдельным прогоном diff без миграции (сравнение `git stash`-версии и версии с миграцией дало пустой `diff`). Применено к реальному локальному PostgreSQL 16 (`prisma migrate deploy`), `checklist-session-feedback.database.spec.ts` подтверждает gate "не раньше старта"/"не после отмены", partial-update autosave-семантику, optimistic-concurrency 409 и очистку поля через `null` через сервисный слой на реальной БД.

Отдельный data backfill или backup сверх общей policy не требуется.

### Session score-recalculation event migration

Migration `20260924040000_add_checklist_score_recalculated_event` также additive и backward-compatible (PR 300, admin session report и аудируемый пересчёт):

- `ChecklistSessionEventType` получает новое значение `score_recalculated` (`ALTER TYPE ... ADD VALUE`) — единственное изменение схемы в этой миграции; `ChecklistScoreRevision` (таблица `checklist_score_revisions`) уже существовала с миграции `20260922180000_add_checklist_session_domain`, новых колонок/таблиц не создаётся;
- не используется в той же транзакции, что и его добавление, поэтому совместимо с обёрткой миграции в транзакцию;
- backfill не требуется — новое значение enum используется только для новых событий, создаваемых `POST /checklist-sessions/:id/recalculate`;
- допускает overlap со старой версией приложения: старая версия просто не знает о новом enum-значении и продолжает работать с событиями сессий как раньше.

Миграция написана вручную (`prisma migrate dev` недоступен в non-interactive sandbox-окружении этой сессии) и проверена на нулевой дрейф через `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <fresh empty db>` — вывод байт-в-байт совпадает (165 строк) с тем же прогоном без этой миграции (сравнение дало пустой `diff`). Применено к реальному локальному PostgreSQL 16 (`prisma migrate deploy`), `checklist-session-recalculate.database.spec.ts` подтверждает пересчёт из persisted-результатов, запись revision/событие/audit log и object-scope denial через сервисный слой на реальной БД.

Отдельный data backfill или backup сверх общей policy не требуется.

---

## 5. Drift handling

Dedicated external production drift gate в repository не подтверждён.

Поэтому drift нельзя считать автоматически предотвращённым только потому, что CI применяет migrations на clean database.

Если требуется production drift verification, это отдельная operational task/check.

---

## 6. Backup policy

### Repository policy

**Статус:** `OWNER-DECISION` / `PARTIAL`

Перед risky production migration должен существовать реалистичный recovery path.

Минимальная intended policy:

1. определить, требуется ли backup/PITR checkpoint;
2. подтвердить его актуальность до destructive/risky change;
3. знать restore procedure;
4. иметь acceptance evidence после restore test/drill, если release risk это требует.

### Live backup state

**Статус:** `LIVE-VERIFY`

Repository не доказывает:

- включены ли сейчас Railway/Postgres backups;
- включён ли PITR;
- retention period;
- last successful backup;
- last restore drill;
- фактическое RPO/RTO.

**Правило:** `MUST NOT` писать «backups enabled/verified» без fresh provider evidence.

---

## 7. Staging/dry-run environment

**Current documented state:** `NO-SEPARATE-RAILWAY-STAGING`.

Repository сейчас не определяет отдельный Railway staging environment.

Поэтому требования вида «обязательно прогнать migration на staging Railway перед production» не являются исполнимым current repository rule без отдельной owner/ops задачи по созданию staging.

Допустимые repository-level checks сейчас:

- CI clean DB migration replay;
- local/test database migration validation;
- targeted data rehearsal при наличии sanitized/copy dataset и отдельной задачи.

Создание отдельного staging environment — отдельное решение.

---

## 8. Rollback semantics

### Application rollback

Можно откатить application revision/image средствами deployment platform, если platform это поддерживает.

### Database rollback

Database rollback не гарантируется application rollback.

Preferred strategies:

- backward-compatible migration;
- expand/migrate/contract;
- forward fix;
- restore from verified backup, если это заранее предусмотрено.

Direct reverse migration допустим только если его безопасность и data impact явно подтверждены.

---

## 9. Pre-deploy checklist for migration-bearing change

- [ ] Migration reviewed.
- [ ] Compatibility with current/previous app version checked.
- [ ] Data/backfill behavior defined.
- [ ] CI migration replay passed.
- [ ] Risk level classified.
- [ ] Backup/PITR requirement decided.
- [ ] If backup required, fresh backup evidence obtained.
- [ ] Rollback/forward-fix strategy documented.
- [ ] Post-deploy verification defined.

Items depending on provider/live DB must be marked `LIVE-VERIFY` until actually checked.

---

## 10. Post-deploy verification

For migration-bearing deployment verify as applicable:

- API readiness;
- critical queries/routes;
- schema/data invariants;
- migration status;
- error logs;
- background/backfill completion.

A successful application healthcheck alone does not prove all data migration invariants.

---

## 11. Rules for AI agents

1. `MUST` treat `prisma migrate deploy` on API startup as current deployment behavior.
2. `MUST NOT` invent a separate Railway staging environment.
3. `MUST NOT` equate CI clean-DB replay with production-data rehearsal.
4. `MUST NOT` claim backup/PITR/restore readiness without fresh provider evidence.
5. `MUST` require explicit confirmation before destructive/irreversible production data operations.
6. `SHOULD` prefer backward-compatible expand/migrate/contract patterns.
7. `MUST` document rollback/forward-fix for risky migrations.

## Связанные документы

- `docs/runbooks/RAILWAY_DEPLOY_GUIDE.md`
- `docs/runbooks/DEPLOY_FOUNDATION.md`
- `docs/quality/READINESS_AND_SECURITY_GATES.md`
- `docs/status/OPEN_DECISIONS.md` — current owner for unresolved decisions; retired mixed tracker history is under `docs/archive/old-trackers/`
