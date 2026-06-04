# Deploy Foundation Plan

Document status: docs-only  
Scope: MVP staging/production-like deploy foundation

This plan defines the deploy foundation for the LMS MVP. It records the selected deployment target, environment strategy, healthchecks, migration strategy, rollback approach, and verification checklist.

This document does not change CI/CD, Railway settings, Dockerfiles, environment values, secrets, runtime code, Prisma schema, or migrations.

## Deployment target

The current MVP deployment target is Railway.

The current repository layout supports a split-service Railway deployment:

| Service | Runtime | Source files |
|---|---|---|
| `web` | React SPA served by nginx | `apps/web/Dockerfile`, `apps/web/railway.json`, `infra/nginx/nginx.conf` |
| `api` | NestJS REST API | `apps/api/Dockerfile`, `apps/api/railway.json` |
| `database` | Railway-managed PostgreSQL | Railway PostgreSQL plugin |

The existing Railway guide remains the operational setup reference:

- `infra/railway/README.md`

## Deploy ownership

Deploy changes must be separated by risk level:

| Change type | Expected PR type |
|---|---|
| Documentation-only deploy plan | docs-only PR |
| Railway config changes | explicit infra PR |
| Dockerfile changes | explicit infra/runtime PR |
| Environment variable contract changes | explicit env/docs PR |
| Prisma schema or migration changes | explicit migration PR |
| CI/CD workflow changes | explicit CI/CD PR |

A feature PR should not silently change deploy behavior.

## Environment strategy

### Local development

Local development uses `.env` / `.env.local` values and local-only services. Local setup is documented in:

- `docs/MVP_LOCAL_RUNBOOK.md`

Local environment values must not be reused as staging or production secrets.

### Staging

Staging is the production-like validation environment.

Staging should use:

- Railway web service;
- Railway api service;
- Railway-managed PostgreSQL;
- staging-only secrets;
- `NODE_ENV=production` for production-like behavior;
- staging web URL as `FRONTEND_URL`.

Staging is where migration, seed, and full MVP smoke checks should run before production.

### Production

Production must use production-only secrets and a verified backup process before database migrations.

Production must not share:

- staging database;
- staging JWT secret;
- local/demo-only credentials;
- local S3/MinIO credentials.

### Environment variable source of truth

The production variable contract is documented in:

- `.env.production.example`

Real values must be stored only in the deployment provider dashboard or secret manager. Real secrets must not be committed to the repository.

## Healthcheck strategy

### API

The API service uses the existing healthcheck endpoint:

```text
GET /api/v1/health
```

Railway API config currently points to:

```text
/api/v1/health
```

The healthcheck should validate that the HTTP server is running. It should stay lightweight and should not depend on slow or destructive operations.

### Web

The web service healthcheck currently points to:

```text
/
```

This checks that nginx serves the SPA shell.

### Post-deploy smoke checks

A healthy deployment is not enough to prove MVP readiness. After deploy, run smoke checks for:

1. web root loads;
2. login page loads;
3. API health returns ok;
4. login succeeds with a staging/demo account;
5. `/api/v1/auth/me` succeeds after login;
6. learner course page loads;
7. lesson/progress path works;
8. assessment path works;
9. certificate path works if the flow has eligible data.

## Migration strategy

Database migration policy is documented in:

- `docs/MIGRATION_BACKUP_POLICY.md`

For non-local environments, use committed migrations only:

```bash
pnpm --filter @lms/api prisma migrate deploy
```

Do not use `prisma migrate dev` against staging or production.

The current API Railway config runs migration deploy before API startup. Before relying on this in staging or production, confirm:

- `DATABASE_URL` points to the intended Railway PostgreSQL database;
- migrations are committed and reviewed;
- backup or restore point exists for staging/production;
- rollback owner is available;
- post-migration smoke checks are planned.

## Seed strategy

Seed data is allowed for local development and staging/demo validation.

Seed data must not be run automatically in production unless explicitly approved for a controlled demo environment.

Before running seed in staging:

- confirm the target database;
- confirm seed idempotency;
- confirm demo credentials are intended for that environment;
- document the command and result in deploy notes.

## Rollback strategy

Rollback depends on what changed.

| Change | Preferred rollback |
|---|---|
| Web-only deploy issue | Redeploy previous Railway web deployment. |
| API-only deploy issue without schema change | Redeploy previous Railway api deployment. |
| API deploy issue with non-destructive schema addition | Forward-fix or redeploy if compatible. |
| Destructive migration issue | Follow `docs/MIGRATION_BACKUP_POLICY.md` and restore only with explicit operator decision. |
| Bad environment value | Fix Railway variable and redeploy affected service. |
| Bad seed data | Use reviewed data repair or restore plan. |

Rollback should not rely on manual production data edits.

## Release checklist

Before staging deploy:

- PR merged to `main`;
- CI green;
- Railway services linked to the intended project;
- required environment variables present;
- API healthcheck path configured;
- web healthcheck path configured;
- database target confirmed;
- migration/backup policy reviewed if database changes are included.

Before production deploy:

- staging deploy complete;
- staging smoke complete;
- backup verified if database migrations are included;
- rollback plan recorded;
- production variables reviewed;
- release owner identified.

After deploy:

- check API logs;
- check web logs;
- verify healthchecks;
- run smoke checklist;
- record known limitations.

## Non-goals

This plan does not:

- implement a new deploy workflow;
- modify GitHub Actions;
- modify Railway project settings;
- add secrets;
- add new Dockerfiles;
- change `railway.json`;
- change Prisma schema or migrations;
- run a real staging or production deploy.

## Follow-up candidates

- PR 89 verification: confirm Railway service config matches the current repo.
- PR 90 verification: confirm `.env.production.example` matches runtime validation.
- PR 103: perform Railway staging deploy and full MVP smoke.
