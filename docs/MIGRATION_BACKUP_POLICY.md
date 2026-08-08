# Migration and Backup Policy

Document status: docs-only  
Scope: MVP production preparation

This policy defines how database migrations and backups should be prepared, reviewed, applied, and rolled back for the LMS MVP.

This document does not add new migrations, does not change `schema.prisma`, does not run Prisma commands, and does not change deploy automation.

## Purpose

- Prevent data loss during database migrations.
- Make production migrations reviewable.
- Ensure a backup exists before any production migration.
- Make rollback decisions explicit and predictable.

## Source of truth

Database structure is defined in:

- `apps/api/prisma/schema.prisma`

Migration files live in the current project structure:

- `apps/api/prisma/migrations`

API Prisma scripts are defined in `apps/api/package.json` and include:

- `prisma:generate`: generate Prisma Client;
- `prisma:migrate`: interactive/local development migration flow (`prisma migrate dev`);
- `prisma:migrate:deploy`: apply committed migrations without prompting (`prisma migrate deploy`) — this is what runs in CI and in production.

## Environment classes

There is no separate staging environment for this project. The Railway project (`reasonable-reprieve`) has a single `production` environment; there is no staging/dry-run environment to apply migrations against before production. Treat CI's ephemeral Postgres service (see `docs/CI_AUDIT_BASELINE.md`) as the closest thing to a migration dry run.

| Environment | Migration rule | Backup rule |
|---|---|---|
| local dev | `prisma migrate dev` may be used against a local or disposable database. | Backup is optional if the database is disposable. |
| CI | `prisma migrate deploy` runs automatically against an ephemeral, disposable Postgres service on every push/PR. | Not applicable — database is recreated per run. |
| production | `prisma migrate deploy` runs automatically on every API deploy, before the API process starts (`apps/api/railway.json` start command). Apply only reviewed and committed migrations. No ad-hoc schema changes. | Verified backup required before a migration that is destructive or otherwise risky. |

## Migration review checklist

Before any migration PR is merged, review:

- the applied product requirement and data impact;
- changes in `apps/api/prisma/schema.prisma`;
- generated migration files in `apps/api/prisma/migrations`;
- whether the migration is destructive, for example drops a column, table, index, or enum value;
- whether existing data needs backfill or transformation;
- whether the migration can be re-run safely;
- the rollback plan and whether it is database-restore or forward-fix based;
- application code that depends on the new schema;
- any assumptions about seed data or demo data.

## Local development flow

A local development migration may be created only against a local or disposable database.

Before using `prisma migrate dev`:

1. Confirm `DATABASE_URL` points to a local or disposable database.
2. Review `apps/api/prisma/schema.prisma`.
3. Review existing migrations.
4. Generate Prisma Client if needed.
5. Run the project checks relevant to the change.

Apply local changes with:

```bash
pnpm --filter @lms/api prisma:migrate
```

This command must not be run against the production database.

## Production migration flow

There is no staging environment to dry-run a migration against before production (see "Environment classes" above). CI's ephemeral Postgres service is the closest available dry run: `prisma migrate deploy` runs there on every push/PR before the migration ever reaches production.

Production migrations run automatically as part of every API deploy — `apps/api/railway.json`'s start command runs `prisma migrate deploy` before starting the API process. There is no manual gate between "PR merged to `main`" and "migration applied to the production database." This makes the pre-merge review below the primary safety check, not a pre-production dry run.

Before merging a migration PR:

1. Confirm the migration is reviewed per the "Migration review checklist" above.
2. Confirm a verified backup exists if the migration is destructive or otherwise risky.
3. Confirm the backup can be restored.
4. Confirm `prisma migrate deploy` will apply only committed migrations (no drift between `schema.prisma` and the migrations directory).
5. Confirm the application code being deployed is compatible with the new schema (the API and its migrations deploy together, in the same image).
6. Have a rollback decision owner available during the merge/deploy window.

To run `prisma migrate deploy` manually against a target database (for example, to recover from a failed automatic deploy):

```bash
pnpm --filter @lms/api prisma:migrate:deploy
```

## Backup policy

Production backups must be verified before any production migration.

A minimum backup record should include:

- timestamp;
- environment;
- database identifier;
- backup method;
- operator or system that created the backup;
- restore verification status;
- retention expectation;
- rollback owner.

A backup is not ready if it cannot be restored or if the restore process is unknown.

## Rollback policy

Rollback strategy depends on the migration type.

| Migration type | Rollback strategy |
|---|---|
| Non-destructive addition | Forward-fix PR is preferred. |
| Destructive change not yet exposed to users | Restore from backup or revert the deploy before release. |
| Destructive change with user data impact | Restore from backup only if approved by the operator. Otherwise, use a forward-fix with a data repair plan. |
| Forward data transformation | Do not roll back by hand-editing data. Use a reviewed repair/forward migration. |

Rollback plan must be written before the migration is applied. If the rollback plan is restore-based, the backup must be verified first.

## Prohibited practices

- Do not run `prisma migrate dev` against the production database.
- Do not edit production data manually to "fix" a migration.
- Do not apply a destructive migration without a verified backup.
- Do not mix migrations with unrelated features, refactors, or docs-only cleanup.
- Do not commit real secrets or database URLs to docs or example files.

## Minimum release notes for a migration PR

A migration PR must include:

- what changed;
- why it is needed;
- whether the change is destructive;
- whether a backup is required;
- how to apply the migration;
- how to verify it;
- how to roll it back;
- what checks were run.

## Checks

For docs-only policy updates:

- lint: not required unless docs linting is enforced;
- typecheck: not required;
- tests: not required;
- build: not required.

For actual migration PRs:

- run Prisma generate;
- run applicable local or CI checks (there is no staging environment to smoke-check separately — see "Environment classes").
