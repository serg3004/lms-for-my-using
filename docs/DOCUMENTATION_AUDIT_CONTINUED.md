# Продолжение аудита актуальности документации

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты документов №1–20. Этот файл продолжает тот же последовательный аудит начиная с №21. Исходные проверяемые документы в audit PR не изменяются.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 21 | `MIGRATION_BACKUP_POLICY.md` | ⚠️ Частично актуален | Migration mechanics актуальны; backup rule противоречив и не enforced, CI проверяет clean replay, staging/docs-only формулировки требуют уточнения |

---

## 21. `MIGRATION_BACKUP_POLICY.md`

**Статус:** ⚠️ частично актуален. Prisma/CI/Railway migration mechanics в основном соответствуют текущему репозиторию, но backup requirement внутри документа сформулирован противоречиво, backup/restore readiness не автоматизирована, а часть environment/check guidance описывает текущую систему неточно.

### Проверено

- `apps/api/package.json` и Prisma scripts;
- `apps/api/prisma/migrations/` и текущий migration baseline;
- `.github/workflows/ci.yml`;
- `apps/api/railway.json`;
- `infra/railway/README.md`;
- `.github/workflows/staging-smoke.yml` и список активных GitHub Actions workflows;
- root `scripts/` и `apps/api/src/scripts/` на наличие backup/restore automation;
- внутреннюю согласованность backup, rollback, environment и checks sections policy.

### Подтверждённые факты

- Source-of-truth paths в документе актуальны: Prisma schema находится в `apps/api/prisma/schema.prisma`, committed migrations — в `apps/api/prisma/migrations/`.
- API scripts соответствуют документу: `prisma:generate` запускает `prisma generate`, `prisma:migrate` — `prisma migrate dev`, `prisma:migrate:deploy` — `prisma migrate deploy`.
- Migration history активно развивается и содержит committed migrations как минимум до `20260805060000_add_deleted_at_to_group_manager_course_join_tables` плюс `migration_lock.toml`; документ правильно исходит из committed migration history, а не ad-hoc schema mutation.
- CI запускается на pull request и push в `main`, поднимает disposable `postgres:16-alpine`, генерирует Prisma Client, затем выполняет `pnpm --filter @lms/api prisma:migrate:deploy` и после этого API database integration tests.
- Railway API config автоматически запускает `prisma migrate deploy` **до** `node dist/main.js`: `startCommand = sh -c 'node node_modules/.bin/prisma migrate deploy && node dist/main.js'`.
- `infra/railway/README.md` описывает тот же deployment flow: push в `main` → Docker build → `prisma migrate deploy` при старте API → application process.
- Policy корректно запрещает `prisma migrate dev` против production database и ручное редактирование production data как способ «исправить» migration.
- Rollback guidance в основном разумно разделяет non-destructive forward-fix, restore/redeploy для destructive changes и reviewed forward data repair вместо ручного изменения данных.

### Несоответствия и риски

1. **Backup requirement противоречит сам себе.** В `Purpose` документ требует `Ensure a backup exists before any production migration`, а раздел `Backup policy` говорит `Production backups must be verified before any production migration`. Но таблица environment classes и production pre-merge flow требуют verified backup только для migration, которая `destructive or otherwise risky`. Нельзя одновременно иметь правило «каждая production migration» и «только destructive/risky» без явного исключения.

2. **Backup/restore requirement является manual procedure, а не repository-enforced gate.** Среди активных workflows есть только CI, CodeQL, Staging smoke и Dependabot Updates. В root `scripts/` и `apps/api/src/scripts/` backup/restore script не обнаружен. Railway при этом автоматически применяет committed migrations при старте API. Следовательно, repository automation не проверяет наличие свежего backup, retention record или успешный restore перед `prisma migrate deploy`.

3. **Из-за автоматического Railway startup migration нет технического backup gate между merge/deploy и применением schema change.** Сам policy это частично признаёт фразой `There is no manual gate between "PR merged to main" and "migration applied to the production database"`. Значит пункты `Confirm a verified backup exists` и `Confirm the backup can be restored` выполняются только организационно, если отдельный deployment process вне репозитория не добавляет такой gate.

4. **CI ephemeral Postgres — полезная, но ограниченная migration validation.** CI доказывает, что committed migrations можно последовательно применить к чистой disposable PostgreSQL и что database integration tests после этого проходят. Это **не эквивалент** upgrade rehearsal существующей production database: не проверяются реальные existing rows, data backfill на production-like объёме, lock duration, downtime, destructive data impact, restore из backup и rollback execution.

5. **`Confirm no drift between schema.prisma and migrations directory` не имеет отдельного автоматизированного drift gate.** В текущем CI есть `prisma generate` и `prisma migrate deploy`, но не обнаружен отдельный `prisma migrate diff`, `prisma migrate status` или эквивалентная schema-vs-migration drift validation. Этот checklist item сейчас manual/review-based.

6. **Фраза `There is no separate staging environment for this project` слишком широкая.** Repository действительно не доказывает наличие отдельной Railway staging database для migration rehearsal. Но одновременно существует активный GitHub Actions workflow `Staging smoke`, который использует `environment: staging`, `STAGING_API_URL`, `STAGING_WEB_URL` и staging smoke secrets. Поэтому следует различать `нет подтверждённого отдельного Railway staging DB/migration environment` и `в репозитории вообще нет staging environment/construct`.

7. **Docs-only checks section не соответствует фактическому CI.** Policy говорит, что для docs-only updates lint/typecheck/tests/build не требуются. Однако текущий `.github/workflows/ci.yml` не имеет path filters и запускает полный job `Checks` для любого pull request, включая docs-only PR. Это уже было подтверждено самим documentation-audit PR.

8. **Live Railway statement не подтверждается repository alone.** Название проекта `reasonable-reprieve`, утверждение о единственном production environment, фактические backup capabilities и restore readiness являются operational facts и требуют live Railway/provider verification, а не только чтения GitHub files.

### Что изменить

1. Выбрать одно backup rule и использовать его во всём документе:
   - либо verified backup обязателен перед **каждой** production migration;
   - либо backup обязателен только для явно определённого класса `destructive/risky`, с формальными критериями этого класса.
2. Если backup действительно является обязательным production safety gate, сделать его enforceable: добавить явный manual deployment approval/check либо automation, которая подтверждает backup identifier/timestamp и restore verification **до** применения migration. Если автоматизация пока не планируется, прямо назвать правило manual operational procedure.
3. Уточнить CI wording: clean ephemeral database подтверждает replay/installability committed migrations и post-migration integration tests, но не является production-data upgrade rehearsal.
4. При необходимости строгого schema/migration consistency добавить автоматизированный drift check; иначе обозначить `no drift` как manual review item.
5. Переписать environment terminology: отдельно описать GitHub `staging` smoke environment и отсутствие подтверждённого отдельного Railway staging database/migration rehearsal environment.
6. Обновить `Checks` для docs-only policy changes: текущий GitHub Actions CI запускает полный workflow независимо от path, даже если локально отдельные code checks не требуются по смыслу изменения.
7. Добавить `Verified at` / `Verified against main SHA` к operational environment claims.
8. Сослаться на реальный authoritative backup/restore runbook/provider procedure, включая способ создания backup, retention/PITR policy, restore command/process и место хранения verification record. Если такого runbook нет, отметить это как отдельный production-readiness gap.
9. Для risky migrations добавить explicit проверку production compatibility: backfill strategy, expected lock/runtime, expand/contract compatibility при rolling/retry deploy и forward-fix plan.

### [НЕ ПРОВЕРЕНО]

- Фактическое количество Railway environments и наличие отдельной staging database на 2026-08-08.
- Фактический production backup schedule, provider snapshot/PITR configuration, retention и latest successful backup timestamp.
- Реальный успешный restore test production backup и время восстановления.
- Существует ли вне GitHub отдельный Railway/manual deploy approval, который блокирует risky migration до подтверждения backup.
- Исторически соблюдался ли backup checklist перед каждой destructive/risky production migration.
- Production database schema/data не читались и никакие production migration/backup операции в рамках аудита не выполнялись.

### Итог

Policy хорошо фиксирует базовую безопасную модель Prisma: local `migrate dev`, committed migrations, CI/production `migrate deploy`, review до merge и преимущество forward-fix над ручным редактированием данных. Главный недостаток — разрыв между заявленной backup safety policy и фактическим enforcement: документ одновременно требует backup перед любой migration и только перед risky/destructive, а repository deployment автоматически применяет migrations без machine-verification backup/restore readiness. CI clean-database replay полезен, но его нельзя описывать как полноценный production migration dry-run. Environment и docs-only checks terminology также нужно привести к фактическим GitHub workflows.
