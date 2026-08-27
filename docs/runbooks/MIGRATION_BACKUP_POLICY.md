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