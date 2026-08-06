# MVP Readiness Dashboard

## Purpose

This dashboard summarizes the current MVP readiness state after backend smoke, web smoke, OpenAPI, env loading, startup safety, response contract, CI hardening, upload, and dependency maintenance work.

It is a status document only. It does not replace the detailed source documents:

- `docs/MVP_DEFINITION_OF_DONE.md`
- `docs/PILOT_CHECKLIST.md`
- `docs/MVP_LOCAL_RUNBOOK.md`
- `docs/API_CONTRACTS.md`
- `docs/API_STATUS.md`
- `docs/STORAGE_UPLOAD_STATUS.md`
- `docs/PASSWORD_RESET_STATUS.md`
- `docs/API_RBAC_MATRIX.md`
- `docs/TODO_VERIFY.md`
- `docs/DEPENDABOT_PNPM_WORKSPACE_POLICY.md`

## Overall status

| Area | Status | Evidence |
| --- | --- | --- |
| Backend MVP flow | Ready for controlled pilot validation | Backend smoke covers login, course setup, lesson, assignment, progress, completion, and certificate issuing. |
| Web smoke coverage | Ready for controlled pilot validation | Web tests cover login, route protection, API client auth errors, shared UI states, admin pages, and learner page smoke rendering. |
| API documentation | Synced baseline | Manual OpenAPI paths are synced with current controllers. |
| Local env loading | Ready | API explicitly loads local `.env` / `.env.local` before env validation and skips this in production/CI. |
| Startup failure handling | Ready | API bootstrap failures are caught, redacted, logged, and mark the process as failed. |
| API error response contract | Ready | Error envelope construction is centralized through the API response helper. |
| CI quality gates | Ready | CI runs install, lint, Prisma generate, typecheck, tests, and build with concurrency, timeout, pnpm cache, and Prisma auto-install protection. |
| Dependency automation | Ready | Dependabot npm updates use workspace-level `directories` so nested manifests stay aligned with the shared root `pnpm-lock.yaml`. |
| Storage uploads | Ready for controlled MVP usage with object storage configured | Material file endpoints use tenant-scoped private keys; authorized downloads receive short-lived presigned URLs. |
| Password reset | Documented as skeleton only | Current password reset status is documented in `docs/PASSWORD_RESET_STATUS.md`; endpoints validate input but return `503 Service Unavailable`. |
| Demo seed data | Needs follow-up | Local demo seed coverage is planned for PR 70. |
| Full RBAC audit | Needs follow-up | Full learner/admin RBAC audit is planned for PR 71. |
| Deployment | Not ready as a fully automated production process | Deployment foundation exists, but production deployment automation remains outside the current MVP baseline. |

## Pilot go / no-go summary

Go for a controlled technical pilot only if:

- CI is green for the pilot branch.
- Local env follows `docs/MVP_LOCAL_RUNBOOK.md`.
- Pilot data uses disposable credentials and no real secrets.
- S3-compatible storage variables are configured when upload testing is in scope.
- Known limitations are accepted: password reset skeleton behavior, no completed full RBAC audit yet, no production deployment automation, and storage upload hardening gaps listed in `docs/STORAGE_UPLOAD_STATUS.md`.

No-go if:

- CI is red.
- Required env setup is unclear.
- Seed/demo data contains real secrets or personal data.
- Tenant isolation or auth behavior is not verified for the pilot scenario.
- Upload testing is required but object storage env variables are not configured.
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
- Web login, protected route, API client error, shared state UI, admin page, and learner page smoke coverage.
- CI gates for lint, typecheck, tests, build, and Prisma generate.
- Storage upload flow for controlled material uploads when S3-compatible object storage is configured.
- Dependabot workspace-level pnpm update policy and documentation.
- Password reset status documented as skeleton-only for current MVP.

Known non-goals for current MVP:

- Production deployment automation.
- Production-grade file storage hardening beyond the documented MVP upload constraints.
- Full password reset delivery.
- Advanced analytics.
- Full admin CRUD expansion.
- Full RBAC audit completion.

## Next planned doc/status work

1. PR 70 — verify/expand local demo seed data.
2. PR 71 — full learner/admin RBAC audit.
3. Update this dashboard after PR 70 and PR 71 are completed.
