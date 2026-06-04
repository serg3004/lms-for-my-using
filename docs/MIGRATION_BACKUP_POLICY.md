# Migration and Backup Policy

Document status: docs-only  
Scope: MVP staging/production preparation

This policy defines how database migrations and backups should be prepared, reviewed, applied, and rolled back for the LMS MVP.

This document does not add new migrations, does not change `schema.prisma`, does not run Prisma commands, and does not change deploy automation.

## Purpose

- Prevent data loss during database migrations.
- Make production and staging migrations reviewable.
- Ensure a backup exists before any production migration.
- Make rollback decisions explicit and predictable.

## Source of truth

Database structure is defined in:

- `apps/api/prisma/schema.prisma`

Migration files live in the current project structure:

- `apps/api/prisma/migrations`

API Prisma scripts are defined in `apps/api/package.json` and include:

- `prisma:generate`: generate Prisma Client;
- `prisma:migrate`: interactive/local development migration flow.

## Environment classes

| Environment | Migration rule | Backup rule |
|---|---|---|
| local dev | `prisma migrate dev` may be used against a local or disposable database. | Backup is optional if the database is disposable. |
| staging | Apply only reviewed and committed migrations. | Backup or restore point required before migration. |
| production | Apply only reviewed and committed migrations. No ad-hoc schema changes. | Verified backup required before migration. |

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

This command must not be run against staging or production databases.

## Staging migration flow

Staging is the dry-run environment for production-like data changes.

Before applying a staging migration:

- confirm the staging database target;
- confirm the migration commit is merged or approved for the staging release branch;
- confirm staging backup readiness or a restore point;
- apply the migration;
- run a staging smoke check for the affected flows;
- record the migration result in the release/deploy notes.

## Production migration flow

Production migrations are operator-controlled and must be applied only after review of the migration, backup, and rollback plan.

Before a production migration:

1. Confirm the correct production database target.
2. Confirm a verified backup exists.
3. Confirm the backup can be restored.
4. Confirm the release branch or commit to deploy.
5. Confirm `prisma migrate deploy` will apply only committed migrations.
6. Confirm the application version being deployed is compatible with the new schema.
7. Have a rollback decision owner available during the migration window.

Apply production migrations with the deployment process selected for the environment. For non-local databases, use `prisma migrate deploy`, not `prisma migrate dev`.

```bash
pnpm --filter @lms/api prisma migrate deploy
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

- Do not run `prisma migrate dev` against staging or production.
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
- run applicable local or CI checks;
- run staging smoke check before production.
