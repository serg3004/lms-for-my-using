# Railway deployment notes

> **Статус:** `CURRENT` operational reference.
>
> Current repository config owns deploy commands/env contracts. Live Railway topology/provider state always requires fresh external read-back.

## Repository topology contract

- Web is the intended public entrypoint.
- API is intended to be reached through the Web/Nginx private-service path unless an explicit ops decision changes the topology.
- Malware scanner is an optional private service whose current contract is owned by `services/malware-scanner/` and API upload code.

Do not treat this repository description as proof that the live Railway project currently matches it.

## API startup and ports

Current Railway API startup is owned by `apps/api/railway.json`; do not copy its exact command into another authority. Runtime port handling is owned by current API env/config code.

## Health

Current health/readiness paths and payloads are owned by health controller/service code and runtime OpenAPI. Operational readiness semantics are documented in `docs/quality/READINESS_AND_SECURITY_GATES.md`.

## Production environment

Use `.env.production.example` plus current env validation as the repository inventory. Important policy topics include proxy trust, Redis/degraded-mode choice, S3-compatible storage and scanner integration; actual live values/providers are not proven by repository examples.

## Demo seed

Use the guarded procedure in `docs/runbooks/ADMIN_DEMO_SEED.md`. Historical unguarded seed commands are not current operational guidance.

## Staging and live verification

A workflow/environment name in GitHub does not prove that a matching Railway environment exists. Fresh external evidence is required for:

- Railway service topology/domains;
- Redis availability/topology;
- storage provider/bucket/CORS/lifecycle;
- scanner availability;
- backup/PITR/restore readiness;
- production smoke/rollback state.

## Related docs

- `docs/runbooks/RAILWAY_DEPLOY_GUIDE.md`
- `docs/runbooks/DEPLOY_FOUNDATION.md`
- `docs/runbooks/MIGRATION_BACKUP_POLICY.md`
- `docs/contracts/STORAGE_UPLOAD_STATUS.md`
- `docs/quality/READINESS_AND_SECURITY_GATES.md`
