# Migration and Backup Policy

> **Статус:** `CURRENT`
>
> **Назначение:** описать current migration behavior, требования к compatibility/rollback и отдельно обозначить, что backup/PITR/restore state требует live verification.
>
> **Проверено по `main`:** `bd602622a4647f825cf5f5bc3bf10f663940c0a5` (2026-08-09).

## Checklist voice recordings migration (PR 509)

Deploy `20261125120000_checklist_voice_notes` before the API. It is additive: the
enum `ChecklistVoiceNotePlace` and the table `checklist_voice_notes` (check, criterion,
place, private storage key and type, length, size, author), with cascading foreign keys
to organizations and checks and `SET NULL` for the author. Existing checks have no rows
and need no backfill. On application rollback keep the table: the recordings stay in
storage under `organizations/<id>/checklist-voice/` and are simply not shown. Deleting
rows without deleting the objects leaves orphaned files, so remove both together.

## Checklist dictation and voice settings migration (PR 511)

Deploy `20261125140000_voice_dictation_settings` before the API. It is additive: the enum
`checklist_input_mode` (`inherit`, `on`, `off`), five columns on `organizations`
(`dictation_enabled` default true, `voice_notes_enabled` default false,
`voice_note_max_seconds` default 120, `voice_notes_per_comment` default 3,
`voice_settings_version` default 1) and two columns on `checklists` (`dictation_mode`,
`voice_notes_mode`, default `inherit`). No backfill. Voice recording is off for every
existing organization after the migration until an administrator turns it on; saved
recordings stay readable. On application rollback keep the columns: the old API ignores them.

## Checklist voice recordings by place migration (PR 512)

Deploy `20261126160000_voice_note_field` before the API. It adds the nullable column
`checklist_voice_notes.field` (which closing text a `summary` recording belongs to) and
replaces the lookup index with one that includes it. Existing recordings keep `field` null
and stay valid (`answer`). No backfill. On application rollback keep the column: the old
API ignores it.

## Checklist folder colour and named access migration (PR 515)

Deploy `20261127100000_checklist_folder_color_sharing` before the API. It adds
`checklist_folders.color` (text, default `purple`, check against the six fixed colours) and
`checklist_folders.shared_user_ids` (uuid array, default empty): employees a folder is opened to
by name. Existing folders become purple and open to nobody by name, so nothing changes for them.
No backfill. On application rollback keep the columns: the old API ignores them.

## Assessment analytics layout migration (PR 533)

Deploy `20261125090000_assessment_analytics_layouts` before the API. It adds the
`assessment_analytics_layouts` table for personal card settings. Existing records do
not require backfill. Keep the table on application rollback so saved layouts are
available after redeployment.

## Assessment question bank migrations (PR 530)

Deploy `20261124160000_freeze_assessment_answers` before
`20261124170000_question_bank` and the new API. The first migration writes
snapshots for existing standard assessment answers from the question and option
data present at migration time. It preserves existing scores and longread
snapshots. Include this write in migration planning for databases with large
assessment answer tables.

The second migration adds bank folders, entries and question references, plus
the sampled-attempt snapshot. Keep both migrations in place on application
rollback. The previous API cannot resume a sampled attempt from its snapshot,
so disable sampled assessments before routing learners to an earlier build.

## Assessment settings migration (PR 529)

`20261124150000_assessment_policy` adds nullable policy, feedback, locked answers and
certificate result columns. Deploy the migration before the new API. Existing assessments
use their prior behavior when the policy is absent. No data backfill is required.

Keep the columns during application rollback. The earlier API ignores the new policy fields
and cannot continue an untimed attempt with locked answers.


## Assessment review settings migration (PR 535)

`20261125130000_freeze_assessment_review_settings` extends existing assessment
answer snapshots with the review settings available at migration time. It fills
missing snapshots from the question and option records available at that time.
Existing snapshots, scores, responses and timestamps are preserved. Apply the
migration before deploying the updated API and retain the snapshots on rollback.

## Assessment editor draft migration (PR 527)

`20261124140000_assessment_editor_draft` adds a nullable JSONB column, `assessments.editor_draft`.
Apply it before deploying the updated API. Existing tests open in the editor with their stored
settings and questions. The migration needs no backfill or special backup procedure.

On application rollback, retain the column so saved drafts can be reopened after redeployment.
The older editor reads and writes the canonical test settings and question records.

## Standalone assessment assignments migration (PR 523)

`20261124100000_assessment_assignments` adds a nullable token digest to assessments and
an assignment table with a unique assessment and employee pair. Apply it before deploying
the updated API and worker. The migration needs no backfill or special backup procedure.
On application rollback, retain the table and digest column to preserve deadlines and link
state. Older API versions do not enforce the new standalone link and assignment checks.

## Standalone assessment placements migration (PR 522)

`20261124090000_assessment_placements` makes the source course optional, creates placement
records and backfills the course and placement of historical attempts in a single transaction.
The backfill covers attempts from longread blocks removed from the current draft. It preserves
attempt IDs, scores and existing certificate references.

Verify a recoverable backup using the standard policy below. Pause assessment writes from
the old API before applying the migration and resume them with the updated API. The old API
does not populate the new context columns when writing attempts. Allow for table locks and
the attempt backfill when planning the deployment window.

Keep the placement and attempt data on rollback. Check for standalone assessments and
attempts from new placements before reverting the API. The old API requires a course on
every assessment and cannot attribute attempts from shared tests to their recorded placements.

## Activation QR migration (PR 504)

Migration `20261123090000_activation_qr` adds a personal QR flag to `user_invitations` and nullable shared code columns with unique indexes to `organizations` and `departments`. Existing invitations keep their email-link behavior. Shared codes are initially unset and issued by an administrator. The migration is additive and needs no data backfill. Apply it before deploying the QR-enabled API.

## Checklist block appearance migration (PR 422)

`20261105130000_checklist_appearance` is additive and backward-compatible:

- one statement: `ALTER TABLE "checklists" ADD COLUMN "appearance" JSONB` (nullable, no default); no table is rewritten and no backfill is needed, so every existing sheet keeps the standard look (`null`);
- the value holds only `#RRGGBB` colours, a 0-4 px border and radius/padding from fixed sets, sanitized on write; an older API build neither reads nor writes the column, so the migration may run before the deploy;
- backup/restore: the column is part of the ordinary table backup; no special step and no new environment variable;
- rollback: drop the column; sheets return to the standard look and nothing else depends on it.

## Checklist scoring mode "Without points" migration (PR 416)

`20261103140000_checklist_scoring_mode_none` is additive and backward-compatible:

- one statement: `ALTER TYPE "ChecklistScoringMode" ADD VALUE IF NOT EXISTS 'none'`; no table is rewritten and no row changes, so every existing sheet, assignment and snapshot keeps its mode;
- an older API build never writes the new value, so the migration may run before the API deploy; on rollback the value stays in the enum (Postgres cannot drop an enum value) and is harmless; no special backup and no new environment variable.

## Criterion description and explanation rule migration (PR 415)

`20261103120000_checklist_item_description_note` is additive and backward-compatible:

- adds to `checklist_items`: nullable `description`, `description_enabled` (default false), `note_rule` (default `'off'`), nullable JSONB `note_answers`, `note_required` (default false);
- every existing criterion keeps the description off and the rule `off`, so no existing sheet, assignment or snapshot changes behaviour; the explanation is stored in the existing `checklist_item_results.comment`;
- an older API build ignores the new columns, so the migration may run before the API deploy and can be left in place on rollback; no special backup and no new environment variable.

## Checklist feedback layout migration (PR 405а)

`20261101180000_checklist_feedback_layout` is additive and backward-compatible:

- adds nullable JSONB `checklists.feedback_layout` (NULL = the classic three text fields) and nullable JSONB
  `checklist_sessions.feedback_answers`, and creates the new `checklist_answer_sets` table (organization FK `CASCADE`, creator FK `SET NULL`);
- one data statement: every session that already has any of `strengths`, `development_areas`, `next_steps` gets `feedback_answers`
  filled from those columns (non-null values only). The old columns are kept, are still written for the built-in fields and are never
  dropped, so the statement is repeatable and loses nothing; sessions without feedback stay NULL;
- an older API build ignores the new columns and table, so the forward migration may run before the API deploy and can be left in place on rollback;
- no special backup beyond the general policy is needed. No new environment variable.

PR 405 UI/report completion adds an optional root `title` inside existing layout JSON; it needs no additional DDL.
Deploy the additive migration above before the web/API release. Keep legacy columns and JSON data on rollback;
rolling the UI back hides custom controls but must not remove saved layouts or answers. Existing default forms and
legacy report columns continue to read through the compatibility layer.

## Checklist settings overrides migration (PR 397)

`20261031140000_checklist_settings_overrides` is additive and backward-compatible:

- adds nullable `*_override` columns (thresholds, result colours, feedback visibility, observer eligibility) and two array columns
  with an empty default (`observer_roles_override`, `observer_user_ids_override`) to `checklists`, and a nullable JSONB
  `report_settings` to `checklist_instances`;
- performs no backfill, deletion, rename or constraint change: every existing checklist keeps all overrides empty ("as in the
  organization") and every existing instance keeps `report_settings` NULL, which reads as the current effective settings;
- an older API build ignores the new columns, so the forward migration may run before the API deploy and can be left in place on rollback;
- no special backup beyond the general policy is needed. No new environment variable.

## Assessment question types migration (PR 388)

`20261031130000_add_assessment_question_types` extends the existing assessment system:

- adds `matching`, `ordering`, `fill_blank`, `short_answer` to `AssessmentQuestionType`;
- adds nullable JSONB `assessment_questions.definition` and `assessment_attempt_answers.response`;
- atomically replaces the existing selection CHECK with its three-format extension: exactly one
  of single option ID, selected-option JSON, typed-response JSON. A typed response must be an object
  with a supported `type`; complete question/answer validation remains in the API. This CHECK is
  maintained in migration SQL because Prisma's schema DSL cannot express it;
- performs no backfill, score recomputation, result/certificate change, deletion or enum rename.
  Legacy option rows remain valid; their new columns stay SQL NULL. No new environment variable.

Apply forward migrations before running the updated API (`prisma migrate deploy`, as in the
existing deployment procedure). Added columns/enum members do not require a separate data migration.
PostgreSQL takes table locks while adding columns/replacing the CHECK and validates existing rows;
use the existing backup/maintenance policy for the target database. Local disposable-PostgreSQL
tests apply the actual SQL to copies of legacy tables and compare rows, old enum values, reports
and certificates. This is repository test evidence, not confirmation of a production backup/restore.

Rollback: stop authoring/submitting the newly defined question types, then roll back application
code only after checking whether new enum values/typed responses have been stored. Old application
versions do not understand these new values, so a fully transparent downgrade is not guaranteed
once new questions exist. Keep the migration and all existing definitions/attempts; do not remove
enum members/columns or rewrite historical grades. Restoring a database requires the separate
approved backup/restore procedure; `longreadEnabled` alone does not disable standalone assessments.

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

- создаёт два новых enum (`ChecklistGeolocationPolicy`, `ChecklistFeedbackVisibility`) и новую таблицу `checklist_workplace_settings` (tenant-scoped конфигурация для планируемого режима "session" Checklist-модуля, `docs/archive/completed-plans/CHECKLIST_WORKPLACE_TRAINING_IMPLEMENTATION_PLAN.md` PR 286) без изменения существующих таблиц `checklists`, `checklist_items`, `checklist_instances` или любой другой существующей таблицы;
- не выполняет backfill: ни одна Organization не получает строку настроек автоматически — сервис (`ChecklistWorkplaceSettingsService`) читает документированные safe defaults для tenant без собственной строки и создаёт строку только при первом `PATCH`, тот же ленивый паттерн, что и `organization_themes`;
- `organization_id` — обычный (не partial) unique constraint на 1:1 связь с `organizations`, выражен прямо в Prisma DSL (`@unique`), raw SQL не требуется — здесь нет понятия "текущей" записи, как в `department_managers`/`reporting_lines`;
- допускает overlap со старой версией приложения: старая версия просто не знает о новой таблице/эндпоинте и продолжает работать без неё.

Отдельный data backfill или backup сверх общей policy не требуется.

### Checklist session domain migration

Migration `20260922180000_add_checklist_session_domain` также additive и backward-compatible:

- создаёт семь новых enum (`ChecklistSessionStatus`, `ChecklistSessionEventType`, `ChecklistSessionReminderType`, `ChecklistSessionReminderStatus`, `ChecklistLocationCapturePoint`, `ChecklistLocationCaptureStatus`, `ChecklistScaleStatus`) и семь новых таблиц (`checklist_sessions`, `checklist_session_events`, `checklist_score_revisions`, `checklist_session_reminders`, `checklist_location_captures`, `checklist_scales`, `checklist_scale_levels`) — domain model для workplace-training режима "session" (`docs/archive/completed-plans/CHECKLIST_WORKPLACE_TRAINING_IMPLEMENTATION_PLAN.md` PR 288, `docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md`);
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

Migration `20260923150000_add_checklist_observation_sheet_builder` также additive и backward-compatible (PR 296, `docs/archive/completed-plans/CHECKLIST_WORKPLACE_TRAINING_IMPLEMENTATION_PLAN.md`):

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

### Checklist idempotency keys migration

Migration `20260924100000_add_checklist_idempotency_keys` — новая таблица, additive и backward-compatible (PR 301, concurrency и idempotency для checklist-сессий):

- новая таблица `checklist_idempotency_keys` (`id`, `organization_id`, `scope`, `key`, `response_body` JSONB, `created_at`) с уникальным индексом `(organization_id, scope, key)` и вспомогательным индексом `(organization_id, created_at)`; FK на `organizations(id) ON DELETE CASCADE`;
- не изменяет ни одну существующую таблицу/колонку — `POST /checklist-sessions`, `POST /checklist-sessions/:id/{start,pause,resume,complete,cancel}` и `POST /checklist-sessions/:id/recalculate` получили новое optional поле `idempotencyKey` в теле запроса, но при его отсутствии поведение полностью совпадает с поведением до этой миграции;
- backfill не требуется — таблица используется только для новых запросов, отправленных с непустым `idempotencyKey`;
- допускает overlap со старой версией приложения: старая версия просто не знает о новой таблице и продолжает работать как раньше (никогда не читает и не пишет в неё);
- retention: строки не удаляются автоматически в этой PR — таблица растёт пропорционально числу запросов с явным `idempotencyKey`, что ожидается редким (только retry-логика клиента). TTL/очистка сверх этого не запрошены и помечены как будущая задача, а не release blocker (значение поля небольшое, JSONB-снимок ограничен размером самого session/revision-ответа).

Миграция написана вручную (`prisma migrate dev` недоступен в non-interactive sandbox-окружении этой сессии) и проверена на нулевой дрейф через `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <fresh empty db>` — вывод байт-в-байт совпадает (167 строк) с тем же прогоном без этой миграции (сравнение дало пустой `diff`). Применено к реальному локальному PostgreSQL 16 (`prisma migrate deploy`), `checklist-session-idempotency.database.spec.ts` подтверждает replay-поведение (включая гонку двух конкурентных `create()`-вызовов с одинаковым ключом, резолвящуюся ровно в одну сессию) на реальной БД.

Отдельный data backfill или backup сверх общей policy не требуется.

### Checklist session observer-unavailable migration

Две последовательные миграции, обе additive и backward-compatible (PR 302, observer unavailable / reassignment):

- `20260924150000_add_checklist_session_observer_unavailable` — две новые nullable-колонки на `checklist_sessions`: `observer_unavailable_reason` (TEXT), `observer_unavailable_at` (TIMESTAMPTZ). Ни одна существующая колонка не меняется, backfill не требуется — обе колонки `NULL` для всех уже существующих сессий, что и означает "observer available" (отсутствие флага);
- `20260924150100_add_checklist_session_observer_unavailable_event` — `ChecklistSessionEventType` получает новое значение `observer_marked_unavailable` (`ALTER TYPE ... ADD VALUE`), единственное изменение в этой миграции. Разнесено в отдельный файл от колонок намеренно (как и `20260924040000_add_checklist_score_recalculated_event` в PR 300) — Postgres запрещает использовать новое enum-значение в той же транзакции, где оно добавлено, а колонки и enum-значение логически независимы, так что разделение на два файла не требует специального non-transactional flag;
- допускает overlap со старой версией приложения: старая версия просто не знает о новых колонках/enum-значении и продолжает работать как раньше;
- retention: колонки не удаляются автоматически (`observerUnavailableReason: null` на reassign — обычный UPDATE, не soft/hard delete) — отдельный data backfill или backup сверх общей policy не требуется.

Обе миграции написаны вручную (`prisma migrate dev` недоступен в non-interactive sandbox-окружении этой сессии) и проверены на нулевой дрейф через `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <fresh empty db>` — вывод байт-в-байт совпадает (167 строк) с тем же прогоном без этих миграций (сравнение дало пустой `diff`). Применены к реальному локальному PostgreSQL 16 (`prisma migrate deploy`), `checklist-session-observer-unavailable.database.spec.ts` подтверждает mark-unavailable + notification + "не блокирует управление session" + reassign-clears-flag + object-scope denial на реальной БД.

Отдельный data backfill или backup сверх общей policy не требуется.

### Checklist score-revision scored-flag migration

Миграция `20260925120000_add_checklist_score_revision_scored` — новая колонка с data-dependent backfill (PR 307/308 follow-up, #797/#798): единственная миграция во всём checklist-session модуле, у которой backfill зависит от существующих данных, а не является тривиальным additive/no-op:

- добавляет `new_scored` (BOOLEAN) на `checklist_score_revisions` — иммутабельный исторический факт "был ли пересчёт реальным баллом или not-scored placeholder'ом", нужный для корректного idempotency-replay `POST /checklist-sessions/:id/recalculate` (см. `API_CONTRACTS.md`'s PR 301 секцию, "Post-merge fixes");
- колонка добавлена **nullable**, затем **backfilled per-row** из текущего `checklist_instances.scored` соответствующего инстанса (`UPDATE ... FROM checklist_instances i WHERE i.id = r.instance_id`), и только после этого переведена в `NOT NULL DEFAULT true` — блок-бланкетный `DEFAULT true` для всех существующих строк первой версии этой миграции был отклонён на код-ревью (Codex) именно потому, что он неверно пометил бы любую историческую all-skipped-ревизию как `scored: true`;
- backfill — best-effort, не perfect: это единственная доступная историческая аппроксимация (точное значение на момент конкретного пересчёта никогда не персистилось до появления этой колонки), но она свободна от единственной альтернативы (blanket `true`), которая гарантированно была бы неверна для части строк;
- допускает overlap со старой версией приложения: старая версия не знает о новой колонке и продолжает работать как раньше (никогда не читает и не пишет `newScored`);
- retention: колонка не удаляется и не обнуляется automated-процессом — обычная append-only ревизионная история, как и остальные поля `ChecklistScoreRevision`.

Миграция написана вручную (`prisma migrate dev` недоступен в non-interactive sandbox-окружении этой сессии) и применена к реальному локальному PostgreSQL 16 (`prisma migrate deploy`) дважды — сначала с blanket-default версией, затем (после отката колонки и записи миграции в `_prisma_migrations` вручную) с исправленной backfill-версией. Backfill-логика проверена отдельно на реальных данных: инстанс с `scored=false` был создан, для него вручную вставлена ревизия, применён сам `UPDATE`-запрос из миграции внутри явно **откатываемой** (`BEGIN ... ROLLBACK`) транзакции — результат подтвердил `new_scored = false`, не `true`. `checklist-session-idempotency.database.spec.ts` (новый тест, реплеящий сохранённую legacy-формы `responseBody` без `scored`) и `checklist-session-recalculate.database.spec.ts` оба зелёные на реальном Postgres после применения миграции.

В этой sandbox-среде попытка честной `prisma migrate diff --from-migrations ... --shadow-database-url <fresh db>` проверки (тот же метод, что у миграций выше) дала большой шумный diff по множеству никак не связанных с этой миграцией таблиц (`assessments`, `courses`, `groups`, ...) — похоже на артефакт версии Prisma CLI/engine в этой sandbox, а не реальный дрейф; результат не включён как достоверное свидетельство и не должен интерпретироваться как обнаруженная проблема с миграцией. Верификация для этой миграции опирается на прямое применение к реальной БД + integration-тесты + ручную проверку backfill-запроса, а не на byte-diff инструмент.

Отдельный data backfill сверх описанного выше или backup сверх общей policy не требуется — миграция additive (новая колонка), не destructive.

### Checklist session context fields migration

Migration `20260927120000_add_checklist_session_context` также additive и backward-compatible (PR 323, персистентные builder-defined "General information" поля во время сессии):

- добавляет две nullable колонки без `DEFAULT` на `checklist_sessions` — `context_fields_snapshot JSONB` (замороженные на момент `start` field-определения из `templateSnapshot`/чек-листа) и `context_values JSONB` (per-session ответы); ни одна существующая колонка не меняется;
- существующие строки `checklist_sessions` получают `context_fields_snapshot = NULL`, `context_values = NULL` — backfill не требуется и не имеет смысла: у сессий, созданных до PR 323, никогда не было snapshot builder-полей, поэтому пустое состояние корректно отражает историю, а не является потерянными данными;
- допускает overlap со старой версией приложения: старая версия просто не знает о новых колонках и продолжает работать с сессиями как раньше (никогда не читает и не пишет `contextFieldsSnapshot`/`contextValues`).

Отдельный data backfill или backup сверх общей policy не требуется.

### Checklist strictness settings migration

Migration `20261024130000_add_checklist_strictness_settings` также additive и backward-compatible (PR 330, настройки строгости на уровне чек-листа):

- добавляет две колонки `checklists.allow_finish_incomplete BOOLEAN NOT NULL DEFAULT false` и `checklists.forbid_gallery_photos BOOLEAN NOT NULL DEFAULT false`; ни одна существующая колонка не изменена;
- `NOT NULL DEFAULT false` на PostgreSQL 11+ не переписывает таблицу (значение по умолчанию хранится в каталоге), поэтому блокировка короткая; существующие чек-листы получают `false`, то есть прежнее строгое поведение — backfill не нужен;
- `CHECKLIST_SNAPSHOT_VERSION` **не увеличена**: настройки добавлены в `ChecklistRuntime` как строго опциональные поля, старые `templateSnapshot` парсятся без изменений и читаются как `false`, а ответ API берёт их только из снапшота;
- допускает overlap со старой версией приложения: старая версия не знает о новых колонках и работает с чек-листами как раньше.

Миграция написана вручную; `prisma migrate diff` от схемы после `migrate deploy` не показывает расхождений по таблице `checklists`. Отдельный data backfill или backup сверх общей policy не требуется.

### Checklist session delete and message migration

Migration `20261025120000_add_checklist_session_delete_and_message` также additive и backward-compatible (PR 333, удаление не начатой сессии и сообщение участнику):

- добавляет nullable колонку `checklist_sessions.deleted_at TIMESTAMPTZ` без default; существующие строки получают `NULL`, то есть остаются «живыми» — backfill не нужен, таблица не переписывается;
- добавляет два значения enum `ChecklistSessionEventType` (`deleted`, `message_sent`) через `ALTER TYPE ... ADD VALUE`; значения не используются в той же миграции, существующие строки событий не затрагиваются;
- удаление мягкое: строка сессии, её события и audit-записи сохраняются (append-only), а парный `ChecklistInstance` без прогресса получает `deleted_at`; жёсткого удаления нет, поэтому откат — это обнуление `deleted_at`;
- допускает overlap со старой версией приложения: старая версия не читает `deleted_at`, поэтому на время выката мягко удалённые сессии могут быть видны старым инстансам — данные при этом не теряются.

Миграция написана вручную; `prisma migrate diff` от схемы после `migrate deploy` не показывает расхождений по таблице `checklist_sessions`. Отдельный data backfill или backup сверх общей policy не требуется.

---

### Checklist default scale migration

Migration `20261026120000_add_checklist_scale_default` также additive и backward-compatible (PR 344, шкала по умолчанию «Да/Нет»):

- добавляет колонку `checklist_scales.is_default BOOLEAN NOT NULL DEFAULT false`; существующие строки получают `false`, backfill не нужен;
- добавляет частичный уникальный индекс `checklist_scales_one_default_per_organization` по `organization_id` с условием `is_default = TRUE` (не более одной шкалы по умолчанию на организацию; Prisma такие индексы не выражает, поэтому индекс описан в SQL и в комментарии `schema.prisma`);
- саму шкалу по умолчанию создаёт приложение лениво при первом открытии списка шкал организации, миграция данные не вставляет;
- старая версия приложения колонку не читает и не пишет, поэтому overlap выката безопасен;
- откат: удалить индекс и колонку; созданные приложением шкалы остаются обычными шкалами.

---

### Checklist recalculation formula migration

Migration `20261025090000_add_checklist_score_formula` (PR 335) is additive. Existing score
revisions receive `snapshot`, the only formula available when they were written; no stored
score, result, reason or timestamp is recalculated. There is no separate data-conversion job.
On supported PostgreSQL versions the constant column default avoids a table rewrite, but
`ALTER TABLE` still needs a short exclusive lock: check long-running transactions before deploy.

Apply with the existing API-startup `prisma migrate deploy` process before starting the new API.
Older API versions ignore the added column; older web clients may omit `formula` and retain
snapshot scoring. Deploy the new API before the new web UI: the old strict request schema does
not accept the new field. For application rollback retain the enum/column and revision history;
do not drop or rewrite criteria revisions. Use a forward fix for schema problems. General
backup/PITR requirements still apply; no destructive operation or extra backfill backup is needed.

Verification covers clean migration replay and real-PostgreSQL scoring/history/concurrent-retry
integration tests (`checklist-session-recalculate.database.spec.ts`). After deployment check
Prisma migration status, absence of null formulas and a known historical revision's `snapshot`
formula, then verify both recalculation choices and their audit entries. Production locks,
backup state and production-data rehearsal remain `LIVE-VERIFY`; local tests do not prove them.

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


### Checklist observer eligibility (PR 351)

`20261027120000_add_checklist_observer_eligibility` adds a selection enum and three non-null
settings columns with defaults; no existing session/instance/snapshot is rewritten. Persisted rows
and organizations without a row both start with instructor/manager/admin selected. This intentionally
expands future selection to manager/admin while preserving existing instructor assignments.

Apply the forward migration before starting the new API. Old API versions ignore the added columns,
but retain their previous instructor-only selection, so mixed-version routing can temporarily differ
for new manager/admin assignments; use a coordinated API rollout. Reads/writes of existing sessions
continue under their existing authorization. PR 352 supplies additional own-session execution rights.

The ALTER requires a table lock; run during the normal migration window. The enum/constant-array
defaults require no session backfill. Roll back the application while retaining the additive columns
and saved configuration; do not delete assigned sessions or drop the new fields to roll back. Verify
fresh and existing-row defaults, all selection modes, invalid tenant/user rejection, before/after audit,
and continuing access to an existing assigned session in PostgreSQL integration tests. Production
backup/restore remains subject to the live verification requirements above.

### Checklist edit-access flag (PR 362в)

`20261029140000_add_checklist_allow_edit_by_all` adds one non-null `checklists.allow_edit_by_all` boolean
defaulting to `true`, so every existing checklist stays editable by all; no index, no backfill. Apply the
forward migration before starting the new API (an older API ignores the column). Roll back the application
while retaining the column. Verified by the PostgreSQL integration test
`checklist-session-observer-create.database.spec.ts` ("PR 362в").

### Checklist result deletion and organization templates (PR 367)

`20261029150000_add_checklist_results_delete_and_templates` is additive: two nullable columns on
`checklist_instances` (`result_delete_reason`, `result_deleted_by`) and a new `checklist_templates` table
with an organization foreign key (`ON DELETE CASCADE`) and one index. No backfill and no destructive
statement; existing rows keep `NULL` and behave as before. Apply the forward migration before starting
the new API (an older API ignores the columns and the table). Roll back the application while retaining
the schema; a deleted result is only soft-deleted (`deleted_at` set together with a reason) and stays
restorable by an administrator for 30 days, so no extra backup is needed. Verified by the PostgreSQL
integration test `checklist-session-observer-create.database.spec.ts` ("PR 367"). Production backup/restore
remains subject to the live verification requirements above.


### Checklist pinned flag (PR 354)

`20261029120000_add_checklist_pinned` adds one non-null `checklists.pinned` boolean defaulting to
`false`; no index (the pin limit counts at most one organization's free checklists) and no
backfill, so every existing checklist stays unpinned. Apply the forward migration before starting
the new API; an older API ignores the column and simply never shows tiles. Roll back the
application while retaining the column. Verify the limit (also under parallel requests), the
automatic unpin when a checklist stops being free or published, and the catalog order in the
PostgreSQL integration test `checklist-pinned.database.spec.ts`.

### Checklist cover (PR 355)

`20261029130000_add_checklist_cover` adds three nullable `checklists` columns (`cover_object_key`,
`cover_mime_type`, `cover_updated_at`); no default, index or backfill, so every existing checklist
has no cover. Apply the forward migration before starting the new API; an older API ignores the
columns. Roll back the application while retaining them. The images live in object storage under
`organizations/<org>/checklist-covers/<checklist>/`: include that prefix in the storage backup next
to the other checklist objects, and note that a restored database row whose object is missing only
degrades to the default illustration. Verify the key never leaves the API, replace/remove cleanup
and the tenant and learner rules in the PostgreSQL integration test
`checklist-cover.database.spec.ts`.

### Checklist access mode (PR 353)

`20261028120000_add_checklist_access_mode` adds the `ChecklistAccessMode` enum, one non-null
`checklists.access_mode` column defaulting to `assigned`, and a b-tree index on
`(organization_id, access_mode, status)`. Every existing checklist therefore keeps its current
behaviour; no instance, session or snapshot is rewritten and no data backfill is required.

Apply the forward migration before starting the new API. Old API versions ignore the added column
and never offer free checklists, so a mixed-version window only hides the new catalog. Roll back the
application while retaining the additive column and index; do not drop the column, because
checklists switched to `free` and instances already started from them would lose their mode.
Verify defaults for existing rows, the catalog, idempotent and concurrent start, and 404 for
non-free, draft, deleted and foreign-tenant checklists in PostgreSQL integration tests. Production
backup/restore remains subject to the live verification requirements above.

### Longread documents and organization flag (PR 381)

`20261030130000_add_longread_documents` adds one non-null boolean `organizations.longread_enabled`
defaulting to `false` and three new tables, `longread_documents` (unique per lesson), `longread_chapters`
(unique `(document_id, anchor)`) and `longread_blocks`, with cascading foreign keys and b-tree indexes. Nothing
existing is rewritten and no backfill is needed: every organization keeps the feature off and every lesson,
course, progress record and assessment behaves as before.

Apply the forward migration before starting the new API. Old API versions ignore the added column and the new
tables. Roll back the application while retaining the column and tables; they are unread while the flag is off
(a longread created meanwhile would otherwise lose its content, so do not drop them). Switching the flag off
is the functional rollback: longread calls answer 404 and longread lessons disappear from lists, data stays.
Verify defaults for existing rows, 404 with the flag off, cascade delete with the lesson, 409 on a stale revision
and tenant isolation in PostgreSQL integration tests (`longreads.database.spec.ts`). Production backup/restore
remains subject to the live verification requirements above.

### Longread versions (PR 382)

`20261030150000_add_longread_revisions` adds the `longread_revisions` table (unique `(document_id, number)`), two columns on
`longread_documents` (`last_revision_number` default 0, nullable unique `published_revision_id`) and one nullable column
`progress.longread_revision_id`, all with `ON DELETE SET NULL` or cascade foreign keys. Nothing existing changes meaning: no
backfill, every longread starts unpublished and every existing progress row keeps a null pin.

Apply the forward migration before starting the new API. Old API versions ignore the new columns and table. Roll back the
application while retaining them; do not drop `longread_revisions` or `progress.longread_revision_id`, because learners
already pinned to a version would lose their version. Revisions are immutable and are never edited by migrations. Verify in
PostgreSQL integration tests (`longread-versions.database.spec.ts`): pinned version stays after republish, restore leaves all
versions byte-equal, concurrent publish never repeats a number, tenant isolation. Production backup/restore remains subject
to the live verification requirements above.

### Longread editor block metadata (PR 383)

`20261030160000_longread_block_editor_metadata` adds nullable `longread_blocks.title` and non-null `hidden`
with default `false`. Existing block content, identifiers, anchors, revisions, lessons and progress are unchanged.
Apply before deploying the API; no backfill or new configuration is required. New API saves from older clients preserve
omitted metadata. The previous API ignores these columns; rollback retains them and can also disable `longreadEnabled`.
Do not drop the columns when rolling back, as that would discard author labels and visibility choices. PostgreSQL tests
cover save/reopen, chapter copy and moving a retained block while deleting its old chapter. Production backup/restore
still requires the live verification described above.

### Longread reading position (PR 385)

`20261030170000_add_longread_reading_state` adds non-null JSONB `progress.longread_reading_state` with default `{}`.
Existing rows retain their status, score, completion timestamp and pinned revision; no backfill or revision rewrite
is required. The empty state starts at the first visible chapter. Apply the migration before deploying the API.
Position updates lock the existing progress row and store only the cursor/visited frontier; they do not complete
chapters or lessons. Author preview never writes progress. Older API versions ignore this additive column.
Rollback keeps the column and data, reverting the application and/or disabling `longreadEnabled`; do not drop it,
as that would discard saved reading positions. PostgreSQL tests verify defaults via migrated fixtures, concurrent
navigation, version pinning, fresh entitlement/tenant checks and preview without learning-record writes. Production
backup/restore remains subject to the live verification requirements above.

### Longread files and covers (PR 386)

`20261031040000_longread_files` adds nullable `course_materials.longread_document_id` (indexed FK, cascade on physical
document deletion) and nullable JSONB `longread_chapters.cover`. Document cover uses existing settings JSON.
Existing materials keep a null owner and retain their behavior; no content/version/progress backfill is needed.
Apply before deploying the API. Rollback retains the columns and references; never drop files or rewrite immutable
snapshots. Functional rollback is switching off `longreadEnabled` while retaining the ownership guard. An application
rollback must keep the generic-material guard/list exclusion for as long as version-owned files exist; deploying
an older API without these checks is not a safe rollback, even with the feature disabled. The existing scanner/S3 configuration is reused, with no
new environment variables or larger upload limit.

`pnpm --filter @lms/api storage:cleanup` remains dry-run by default (`-- --apply` applies deletion). It first runs
longread file reference cleanup: paginated documents are locked using the same document row as save/publish;
files untouched for `S3_ORPHAN_RETENTION_DAYS` (default 30) and absent from the draft **and every immutable revision**
are released, excluding all pending multipart sessions (including expired ones until the existing multipart
cleanup has aborted their storage parts). The existing S3 orphan cleanup then deletes eligible objects.
Dry-run output includes `longreadFiles.candidates`; S3 candidates still reflect rows retained during dry-run.
Keep the existing expired-multipart cleanup scheduled as well. Published or pinned references have no age-based
expiry and survive draft deletion/replacement. PostgreSQL tests cover the scan pipeline, cross-tenant/scope checks,
version retention and cleanup; production backup/restore still requires the live verification described above.

### Checklist folders (PR 395)

Migration `20261031120000_checklist_folders` is additive and backward-compatible:

- creates the table `checklist_folders` (id, organization_id, parent_id, name, visible_to_staff, created_by, timestamps, deleted_at) with FK to `organizations` (`ON DELETE CASCADE`), to itself (`parent_id`, `ON DELETE RESTRICT`: folders are only ever soft-deleted) and to `users` (`created_by`, `ON DELETE SET NULL`), and an index on `(organization_id, parent_id)`;
- adds one nullable column `checklists.folder_id UUID` (no `DEFAULT`) with FK `ON DELETE SET NULL` and an index on `(organization_id, folder_id)`; existing sheets keep `NULL` (the root), so no backfill is needed;
- an older application version neither reads nor writes the new table or column, so a rolling deploy is safe;
- rollback: drop the FK, the column and the table; sheets stay where they were because folders never owned them.

### Checklist extra pictures (PR 421)

Migration `20261105120000_checklist_sheet_photos` is additive and backward-compatible:

- creates the table `checklist_photos` (id, organization_id, checklist_id, order, caption, object_key, mime_type, timestamps) with FK to `organizations` and to `checklists` (both `ON DELETE CASCADE`) and indexes on `(checklist_id, order)` and `(organization_id)`;
- no existing table or column changes and no backfill is needed: a sheet without rows has no extra pictures;
- an older application version neither reads nor writes the new table, so a rolling deploy is safe;
- backup/restore: the rows hold only metadata; the picture bytes live in object storage under `checklist-photos/`, so a database restore needs the matching object storage state (an orphaned object is harmless, a row without its object shows no picture);
- rollback: drop the table; the objects stay in storage and may be removed by prefix.

### Longread exercise attempts (PR 389)

`20261031150000_longread_exercise_attempts` is additive: existing attempts default to `counts_toward_results=true`;
nullable revision/block/sequence/request/hash/fingerprint/context columns and answer `frozen_question` preserve existing
records. A restrictive revision FK retains immutable snapshots used by grades. Three unique indexes and a context CHECK
protect component ordinals, request keys and final fingerprints. No old result, course progress or certificate backfill
is performed. Deploy the migration before the API, then the web application. The real PostgreSQL suite verifies fresh
migration, legacy grading, concurrency, persisted counters, frozen results and restore after source deletion.

Functional rollback disables `Organization.longreadEnabled` and retains the new schema/data. Do not drop revisions,
answer snapshots or attempts. An older API that lacks `countsTowardResults` filters would incorrectly include component
practice/graded responses in ordinary reports and certificate eligibility even with the flag off. Therefore an application
rollback must retain/backport these filters (attempts/results, manager/progress aggregates and certificate checks), or keep
the new API with the feature disabled. New component rows are learning records, not disposable rollback data. As with
other production migrations, take and verify the required live backup before deployment; local test success does not
constitute production backup/restore evidence.

### Longread chapter completion (PR 390)

No DDL migration: the existing `progress.longread_reading_state` JSONB gains a version-keyed `learning` map with chapter
entry/completion timestamps, accepted Continue IDs and checked summaries. Existing bookmarks and historical version
entries are retained. PostgreSQL timestamps and the existing progress row lock govern minimum time and idempotency.
Deploy the API/shared package before the web client; older reader responses remain supported by the new client.

Functional rollback disables `longreadEnabled` while preserving JSON, versions and attempts. Do not remove `learning`
entries or synthesize completion from the cursor frontier. An older position writer would discard new JSON fields:
keep the feature disabled before rolling back such an API, or retain the version-aware writer and the guard refusing
generic longread progress writes. The existing PR 389 attempt/result filters remain required as documented above.

### Checklist numbering (PR 423)

Migration `20261105160000_checklist_show_numbering` adds `checklists.show_numbering BOOLEAN NOT NULL DEFAULT true`.
Existing sheets keep numbering enabled; PostgreSQL’s constant default requires no application backfill.
Apply the migration before the API/web rollout. Existing snapshots without the flag read as enabled;
new snapshots and organization templates retain the selected value. No learning records are rewritten.

This is additive: an older API ignores the column. Application rollback leaves it and the snapshots
intact (the old interface shows numbering). Follow the normal verified production backup policy before
deployment. The disposable PostgreSQL suite exercises migration defaults, copy/template retention and
immutable assignment snapshots; it is not evidence of a production backup/restore.

### Employee checklist points (PR 426)

Migration `20261106100000_checklist_learner_points` adds
`checklists.show_points_to_learner BOOLEAN NOT NULL DEFAULT false`. Existing sheets default to hiding
points from employees. No stored score/result is recalculated or removed, and no JSON backfill is
needed; historical snapshots without the flag read as off.

Apply the additive migration under the normal verified production backup policy. Deploy the web
client that handles optional score fields before enabling the new API wire projection; roll out
API/web as one coordinated release. Older cached clients may need a refresh because the API omits
withheld point fields. An older application can ignore the new column, but an older API does not
enforce the new employee privacy guarantee: retain/backport the projection when rolling back, or
retain the new API. Leave the column, snapshots and all learning results intact.

Disposable PostgreSQL checks cover migration defaults, copy/template retention, assignment snapshots
and staff reporting. They are not production backup/restore evidence. This PR does not deploy or
modify production data.

### Sheet pictures on the filled-in sheet (PR 437)

Migration `20261107120000_checklist_show_sheet_photos` adds
`checklists.show_sheet_photos BOOLEAN NOT NULL DEFAULT true`. Existing sheets keep showing their
pictures; PostgreSQL's constant default needs no application backfill. No picture, file, snapshot or
learning result is rewritten, and the value is not stored in assignment snapshots.

Apply the additive migration under the normal verified production backup policy before the API/web
rollout. An older API ignores the column; an older web client ignores the flag and keeps showing the
pictures. Application rollback leaves the column in place. Disposable PostgreSQL checks cover the
default, copy/template retention and the live (unfrozen) value in assigned sessions; they are not
production backup/restore evidence.

### Public link/QR entry to free sheets (PR 464)

Migration `20261111120000_checklist_public_access` is additive and backward-compatible:

- creates the enum `ChecklistPublicAccess` (`off`, `registered`, `everyone`);
- adds to `checklists` the columns `public_access` (`NOT NULL DEFAULT 'off'`), `public_token` (nullable, unique index `checklists_public_token_key`), `guest_name_required` (`NOT NULL DEFAULT true`), `guest_photos_allowed` (`NOT NULL DEFAULT false`), `public_access_changed_at` and `public_access_changed_by` (nullable, a plain id without a foreign key);
- adds nullable `checklist_instances.guest_name`.

Every existing sheet keeps the entry off with no token, so no backfill is needed and nothing changes for current users. The token is a secret: it is stored as issued and never written to the audit log or application logs. A database restore brings back the tokens of the restored moment, so after restoring from an older backup an administrator should check the sheets with the entry on and reissue the link when a leaked or revoked token could have returned. Apply under the normal verified production backup policy before the API/web rollout; an older API ignores the columns. Application rollback leaves the columns in place. Disposable PostgreSQL checks are not production backup/restore evidence.

### Guest passes: daily limit and link-disabled event (PR 465)

Migration `20261111150000_checklist_public_operations` is additive and backward-compatible: it adds `checklists.public_daily_limit INTEGER NOT NULL DEFAULT 200` (existing sheets get the safe default; the entry is off for all of them anyway) and the value `guest_link_disabled` to the enum `ChecklistInstanceEventType` (`ALTER TYPE ... ADD VALUE`, not used inside the same migration). Apply under the normal verified production backup policy before the API rollout; an older API ignores the column and never writes the event, and reading an event row with the new value would only matter to a code version that predates it, so roll the API forward, not back, after the first guest pass. Guest passes are ordinary checklist instances owned by one archived service user per organization (`guest@guest.invalid`, created on the first guest pass); a restore brings them back with the rest of the instances. Disposable PostgreSQL checks are not production backup/restore evidence.

### Custom roles storage (PR 480)

Migration `20261119150000_custom_roles` is additive and backward-compatible: it creates the enums `CustomRoleState`, `PermissionScope`, `CustomRoleAssignmentState`, adds `organizations.custom_roles_enabled BOOLEAN NOT NULL DEFAULT false` and creates `custom_roles`, `custom_role_permissions`, `user_custom_role_assignments` with composite foreign keys on `organization_id`. No backfill: existing memberships and built-in roles work unchanged. Since PR 481 the role guard reads the new tables, but only while `customRolesEnabled` is on for the organization; an API version that predates PR 481 ignores them. Functional rollback is leaving `customRolesEnabled` off (or switching it off); do not drop the tables, because role definitions and assignments would be lost. The step-by-step enable and rollback procedure, including the emergency SQL, is in `CUSTOM_ROLES_ROLLOUT.md` (PR 486).

### User invitations (PR 487)

Migration `20261121120000_user_invitations` is additive and backward-compatible: it creates the table `user_invitations` (user, organization, `token_hash` with a unique index, `expires_at`, `used_at`, `revoked_at`, `send_count`, `created_by_id`) with a foreign key to `users` (`ON DELETE CASCADE`) and indexes on `(user_id, organization_id)` and `expires_at`. No backfill: existing users and sign-in are unchanged, and an older API ignores the table. Only the SHA-256 hash of an invitation link is stored, so a restore never brings back a usable link; after restoring from an older backup, an administrator should re-send invitations to people still in status `invited`. Rollback is leaving users created with a password; do not drop the table while invited users exist. Apply under the normal verified production backup policy before the API/web rollout. Disposable PostgreSQL checks are not production backup/restore evidence.

### Password policy and history (PR 488)

Migration `20261121150000_password_policy` is additive and backward-compatible: it adds `organizations.password_min_length INTEGER NOT NULL DEFAULT 10` and `password_history_count INTEGER NOT NULL DEFAULT 3` (CHECK 5–20 and 0–10) and creates `password_history` (user, organization, `password_hash`, `created_at`) with a foreign key to `users` (`ON DELETE CASCADE`) and an index on `(user_id, created_at)`. No backfill: existing passwords stay valid and the policy only applies to passwords set afterwards. The table holds password hashes (never plain text), so treat a backup like the `users` table; a restore brings back the history of the restored moment, which at worst lets a very recent password be reused. An older API ignores the columns and the table. Rollback is leaving the policy at its defaults; do not drop the table. Apply under the normal verified production backup policy before the API/web rollout. Disposable PostgreSQL checks are not production backup/restore evidence.

### Temporary password (PR 489)

Migration `20261121180000_temporary_password` is additive and backward-compatible: it adds `users.must_change_password BOOLEAN NOT NULL DEFAULT false` and the nullable `temporary_password_expires_at` and `temporary_password_used_at`. No backfill: nobody is forced to change anything on rollout. The columns hold no secret (the temporary password itself is stored only as an ordinary password hash). An older API ignores the columns; rolling the API back while a person still has `must_change_password = true` lets them use the temporary password like a normal one, so an administrator should reissue or reset such passwords. After restoring from an older backup, people who changed their password later get the older hash back: check the users with a pending temporary password and issue new ones. Apply under the normal verified production backup policy before the API/web rollout. Disposable PostgreSQL checks are not production backup/restore evidence.

### Custom user fields (PR 499)

Migration `20261122120000_user_fields` is additive and backward-compatible: it creates the enum `UserFieldType` and the tables `user_field_definitions` (organization, key, labels, type, required, unique, searchable, options, visibility and edit lists, order, archive time) and `user_field_values` (organization, user, field, value, normalized value, unique key; unique `(user, field)` and `(field, unique_key)`), both with cascade on organization, user and field delete, and adds `organizations.user_fields_seeded_at TIMESTAMP(3)` (nullable). No SQL backfill: the ready-made set (employee number, WhatsApp, Telegram, hire date, work schedule) is created by the API on the first use of the fields of each organization (the same code as `POST /user-fields/template`), which also copies the existing `users.shift` texts into the work schedule field and then sets the flag; a field the administrator later deletes is not brought back by itself. `SELECT count(*) FROM organizations WHERE user_fields_seeded_at IS NULL` shows organizations not yet touched. An API version that predates PR 499 ignores the tables. Rollback: redeploy the previous API; do not drop the tables while the new API runs, and note that `users.shift` stays in step with the work schedule field. `SELECT count(*) FROM user_field_values` shows the size.

### Own profile (PR 496)

Migration `20261121230000_user_profile` is additive and backward-compatible: it adds `users.about_me TEXT`, `users.photo_object_key TEXT`, `users.photo_thumb_object_key TEXT`, `users.photo_mime_type TEXT` (all nullable) and `users.profile_version INTEGER NOT NULL DEFAULT 0`. No backfill. A previous API version ignores the new columns. Rollback: redeploy the previous API; do not drop the columns while the new API runs. Photos live in the object storage under `organizations/<org>/users/<user>/photo/<full|thumb>-<uuid>`; a replaced or removed photo is deleted from storage by the API (best effort), so after a storage failure a stray object can remain and is harmless. `SELECT count(*) FROM users WHERE photo_object_key IS NOT NULL` shows how many photos exist.

### Sign-in journal and devices (PR 494)

Migration `20261121210000_login_journal` is additive and backward-compatible: it adds `organizations.login_log_retention_days INTEGER NOT NULL DEFAULT 90` (CHECK 90–3650), `sessions.last_active_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `sessions.device_label` and `sessions.ip_masked` (nullable), and creates `login_events` (user and organization with cascade, outcome, device label, cut address, time). No backfill: old sessions show as "Unknown device". A previous API version ignores the new columns and the table. Rollback: redeploy the previous API; do not drop `login_events` while the new API runs. Events are removed by `pnpm --filter @lms/api session:cleanup -- --execute` after each organization's retention period (never below 90 days); `SELECT count(*) FROM login_events` shows the size before a manual purge.

### Sign-in protection (PR 493)

Migration `20261121200000_login_lockout` is additive and backward-compatible: it adds `organizations.login_max_failures`, `login_failure_window_minutes` and `login_lock_minutes` (NOT NULL with defaults 5 / 15 / 15 and CHECK ranges 3–20 / 1–120 / 1–1440), `users.login_locked_until TIMESTAMPTZ` (nullable) and creates `login_attempts` (user, organization, time; cascade on user delete). No backfill. An API version that predates PR 493 ignores the new columns and the table. Rollback: redeploy the previous API; the leftovers are harmless. Do not drop `login_attempts` while the new API runs. Failed-attempt rows older than 24 hours are removed by `pnpm --filter @lms/api session:cleanup -- --execute`. Emergency unlock of everyone: `UPDATE users SET login_locked_until = NULL;`.

### Assessment folders (PR 524)

Migration `20261124110000_assessment_folders` adds the folder tree and nullable
`assessments.folder_id`. Existing tests start at the root and retain their
course, lesson and attempt data. The migration marks tests with the historical
UUID slug formats generated by the two longread exercise creation paths.
Apply before deploying the updated API. An application rollback can leave the
new schema in place. If the previous API has created new exercise assessments
during a rollback, reapply the migration's marking predicate to those rows
before re-enabling folder operations.

### Assessment folder color (PR 525)

Migration `20261124120000_assessment_folder_color` adds a color key to assessment
folders. Existing folders get the purple default. Apply before deploying the
updated API. Application rollback can leave the column and its values in place.

### Assessment library authors (PR 526)

Migration `20261124130000_assessment_author` adds a nullable assessment author
with a user foreign key and an organization/author index. Existing assessments
retain a null author. Apply before deploying the matching API. An application
rollback can leave the column and index in place.

### Assessment manual review

Migration `20261124180000_assessment_manual_review` adds the `pending_review`
attempt status and review fields. Existing answers keep their recorded scores.
Deploy the API and web client together. Once attempts enter the review queue,
resolve them before rolling back to a version that cannot process them. Keep
the additive database migration in place during the rollback.

### Assessment materials (PR 537)

Migration `20261125140000_assessment_materials` adds nullable `material` columns to `assessments`, `assessment_questions` and `assessment_answer_options`. Existing rows keep their image URLs and require no backfill. Apply the migration before starting the new API. Back up the database and the organization's `assessment-images/` objects together so that file references and frozen attempts remain usable after a restore. An application rollback can leave the additive columns and stored objects in place.

### Assessment presentation (PR 538)

Migration `20261126090000_assessment_presentation` adds nullable JSONB columns for assessment presentation and the organization's default assessment theme. Apply it before starting the new API. Existing assessments keep their current behavior without a backfill. The migration adds a constraint that requires a null time limit when the title screen is explicitly disabled. On application rollback, leave the columns in place to preserve saved themes and presentation settings.

### Library folders (PR 581)

Migration `20261127200000_library_folders` creates the `library_folders` table (one tree per section, `course` or `assignment`) and adds a nullable `folder_id` to `courses` and `assignments`. Existing rows keep a null folder, which means the root, so no backfill is needed. Apply the migration before starting the new API. On application rollback, leave the table and columns in place; the older version ignores them and the folders are kept for the next release.

### Material library (PR 582)

Migration `20261127220000_material_library` makes `course_materials.course_id` optional, adds `folder_id`, creates `course_material_links` and allows the `material` scope in `library_folders`. Existing materials keep their course and lesson, so no backfill is needed. Apply the migration before starting the new API. On application rollback, leave the changes in place; before rolling back to a version that expects a course on every material, check that no row has a null `course_id` (library materials), because the older version cannot read them.

### Folder access settings (PR 576)

Migrations `20261127230000_folder_access_roles`, `20261127230100_assessment_folder_access` and `20261127230200_folder_shared_users` add `access_roles` to checklist and assessment folders, `visible_to_staff`, `access_roles` and `shared_user_ids` to library folders, and `shared_user_ids` to assessment folders. Existing assessment and library folders are set to visible to all staff, so no folder disappears for anyone; existing checklist folders keep their flag. Apply the migrations before starting the new API. On application rollback, leave the columns in place; the older version ignores them, but folders created while the new version ran as private would then show their old default.

### Who may assign a standalone test (PR 584)

Migration `20261128120000_assessment_assign_grants` adds `assign_roles` (text array) and `assign_user_ids` (uuid array) to `assessments`, both empty by default, so existing tests grant nothing beyond the defaults (administrator, author, manager for their own team). Apply the migration before starting the new API. On application rollback, leave the columns in place; the older version ignores them and again lets only administrators assign.

### Image drop and card sort questions (PR 539)

Migration `20261128140000_assessment_image_drop_card_sort` adds the values `image_drop` and `card_sort` to the enum `AssessmentQuestionType` and extends the `assessment_attempt_answers_selection_check` constraint so a typed response may be of those two kinds. Both changes are additive: existing rows, definitions and answers are untouched, and nothing is rewritten. Apply the migration before starting the new API. On application rollback, leave the enum values in place; the older version does not create such questions, and a test that already contains one would fail to open for the older version, so do not roll back after authors have started to use them.
