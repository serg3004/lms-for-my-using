# API Status

Last synced: 2026-05-28  
Source branch: `docs/rbac-matrix-api-contracts`

## Current status

RBAC and API contract documentation is available for the current MVP baseline:

- `docs/RBAC_MATRIX.md` mirrors the current role policy map from `apps/api/src/modules/auth/roles.ts`.
- `docs/API_CONTRACTS.md` records public/authenticated endpoint conventions, error shape, auth header, tenant scope rules, and contract change rules.
- No runtime API behavior changed in this PR.

## Current limitations

- No Prisma schema or migration changes.
- No CI/CD changes.
- No new dependencies.
- No public runtime API endpoint changes.
- Learner-facing read policies remain intentionally narrow until learner web flows are implemented.

## Endpoint map

No production API endpoint changes in this PR.
