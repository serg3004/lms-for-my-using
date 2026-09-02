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
