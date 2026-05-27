# API Status

Last synced: 2026-05-27  
Source branch: `chore/mvp-seed-data`

## Current status

MVP seed data is available:

- `apps/api/prisma/seed.mjs` seeds the current Prisma MVP baseline.
- The seed script is idempotent through fixed IDs and Prisma `upsert`.
- Dataset includes 1 organization, 1 admin, 1 instructor, 2 learners, 1 group, 1 course, 2 lessons, 1 assignment, and 1 progress record.
- Seed users use local-only `example.test` emails.
- The seed script is standalone and can be run manually with `node prisma/seed.mjs` from `apps/api`.
- API runtime behavior is unchanged in this PR.

## Current limitations

- No Prisma schema or migration changes.
- No CI/CD changes.
- No new dependencies.
- No package script changes.
- No public runtime API endpoint changes.
- No real migrations are applied.

## Endpoint map

No production API endpoint changes in this PR.
