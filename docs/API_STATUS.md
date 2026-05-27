# API Status

Last synced: 2026-05-27  
Source branch: `docs/mvp-local-runbook`

## Current status

MVP local runbook is available:

- `docs/MVP_LOCAL_RUNBOOK.md` documents local `.env` setup.
- Local PostgreSQL and MinIO setup is documented as a local-only Docker Compose example.
- Prisma Client generation is documented through `pnpm --filter @lms/api prisma:generate`.
- Migration guidance is documented as a safe operator-controlled flow.
- API start, web start, and health check are documented.
- API runtime behavior is unchanged in this PR.

## Current limitations

- Docs-only PR.
- No Prisma schema or migration changes.
- No CI/CD changes.
- No deploy scripts.
- No new dependencies.
- No public runtime API endpoint changes.
- No real migrations are applied.

## Endpoint map

No production API endpoint changes in this PR.
