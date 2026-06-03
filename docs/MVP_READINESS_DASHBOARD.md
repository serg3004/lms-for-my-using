# MVP Readiness Dashboard

## Purpose

This dashboard summarizes the current MVP readiness state after the backend smoke, web smoke, OpenAPI, env loading, startup safety, response contract, and CI hardening work.

It is a status document only. It does not replace the detailed source documents:

- `docs/MVP_DEFINITION_OF_DONE.md`
- `docs/PILOT_CHECKLIST.md`
- `docs/MVP_LOCAL_RUNBOOK.md`
- `docs/API_CONTRACTS.md`
- `docs/API_STATUS.md`
- `docs/RBAC_MATRIX.md`
- `docs/TODO_VERIFY.md`

## Overall status

| Area | Status | Evidence |
| --- | --- | --- |
| Backend MVP flow | Ready for controlled pilot validation | Backend smoke covers login, course setup, lesson, assignment, progress, completion, and certificate issuing. |
| Web smoke coverage | Ready for controlled pilot validation | Web tests cover login, route protection, API client auth errors, shared UI states, and learner page smoke rendering. |
| API documentation | Synced baseline | Manual OpenAPI paths are synced with current controllers. |
| Local env loading | Ready | API explicitly loads local `.env` / `.env.local` before env validation and skips this in production/CI. |
| Startup failure handling | Ready | API bootstrap failures are caught, redacted, logged, and mark the process as failed. |
| API error response contract | Ready | Error envelope construction is centralized through the API response helper. |
| CI quality gates | Ready | CI runs install, lint, Prisma generate, typecheck, tests, and build with concurrency, timeout, pnpm cache, and Prisma auto-install protection. |
| Storage uploads | Not ready / documented separately | Current storage upload status still needs explicit documentation in PR 67. |
| Password reset | Skeleton only | Password reset status still needs explicit clarification in PR 68. |
| Demo seed data | Needs follow-up | Local demo seed coverage is planned for PR 70. |
| Full RBAC audit | Needs follow-up | Full learner/admin RBAC audit is planned for PR 71. |
| Deployment | Not ready | Deployment foundation is planned for PR 77. |

## Pilot go / no-go summary

Go for a controlled technical pilot only if:

- CI is green for the pilot branch.
- Local env follows `docs/MVP_LOCAL_RUNBOOK.md`.
- Pilot data uses disposable credentials and no real secrets.
- Known limitations are accepted: no production deployment automation, no production-grade storage upload flow, password reset skeleton behavior, and no completed full RBAC audit yet.

No-go if:

- CI is red.
- Required env setup is unclear.
- Seed/demo data contains real secrets or personal data.
- Tenant isolation or auth behavior is not verified for the pilot scenario.
- A required limitation is not explicitly accepted by the pilot owner.

## Current MVP baseline

Implemented baseline:

- Backend health, auth, organization, users, memberships, groups, courses, lessons, materials, assignments, progress, assessments, attempts, reports, and certificates API surface.
- Centralized API error envelope.
- Manual OpenAPI skeleton synced with current controllers.
- Runtime API env validation.
- Explicit local env loading.
- Safe API startup error logging.
- Backend MVP flow smoke coverage.
- Web login, protected route, API client error, shared state UI, and learner page smoke coverage.
- CI gates for lint, typecheck, tests, build, and Prisma generate.

Known non-goals for current MVP:

- Production deployment automation.
- Production-grade file storage.
- Full password reset delivery.
- Advanced analytics.
- Full admin CRUD expansion.
- Full RBAC audit completion.

## Next planned doc/status work

1. PR 67 — document current storage upload status.
2. PR 68 — clarify password reset status.
3. PR 70 — verify/expand local demo seed data.
4. PR 71 — full learner/admin RBAC audit.
