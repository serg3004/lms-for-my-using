# MVP Readiness Dashboard

## Purpose

This dashboard summarizes the current MVP readiness state. It is a status document only — it does not replace the detailed source documents:

- `docs/MVP_SCOPE_LOCK.md` (§0 has the full per-feature status table this dashboard summarizes)
- `docs/MVP_DEFINITION_OF_DONE.md`
- `docs/PILOT_CHECKLIST.md`
- `docs/MVP_LOCAL_RUNBOOK.md`
- `docs/API_CONTRACTS.md` (status section merged in 2026-08-06; `API_STATUS.md` retired)
- `docs/STORAGE_UPLOAD_STATUS.md`
- `docs/PASSWORD_RESET_STATUS.md`
- `docs/API_RBAC_MATRIX.md`
- `docs/TODO_VERIFY.md`
- `docs/DEPENDABOT_PNPM_WORKSPACE_POLICY.md`
- `docs/CONCERNS.md`

**[2026-08-06] Full recalculation.** The previous version of this dashboard was frozen at the "PR 70 / PR 71 still pending" era (early MVP). Both are long since done, production has been live on Railway for weeks, and the project has since added refresh tokens, full RBAC object-level scoping, group/manager/instructor management, i18n across the admin surface, and more. Rewritten from scratch against the current `main` (PR #505) instead of patching the old table.

## Overall status

| Area | Status | Evidence |
| --- | --- | --- |
| Backend MVP flow | Ready — in active use | Auth, organizations, users, memberships, groups, courses, lessons, materials, assignments, progress, assessments, attempts, certificates all implemented and tested. |
| Web smoke coverage | Ready | 347 web tests passing; admin, learner, instructor, and manager surfaces all covered. |
| Auth / sessions | Ready | Stateless JWT access token + rotating refresh token in httpOnly cookie, server-side revocation, `logout-all`. See `docs/AUTH_TOKEN_REVOCATION.md`, `docs/AUTH_SESSION_STORE_DESIGN.md`. |
| RBAC | Ready | Role-policy matrix + object-level `CourseAccessGuard` (instructor course ownership) + manager team scope. See `docs/API_RBAC_MATRIX.md`, `docs/INSTRUCTOR_COURSE_OWNERSHIP.md`. |
| API documentation | Synced baseline | Manual OpenAPI paths synced with current controllers. |
| CI quality gates | Ready | Lint, Prisma generate, typecheck, tests, build, CodeQL, `pnpm audit`, Gitleaks all run per PR. |
| Dependency automation | Ready | Dependabot workspace-level `directories` config. |
| Storage uploads | Ready for controlled MVP usage | Tenant-scoped private keys, short-lived presigned URLs, MinIO deployed as its own Railway service (bucket `lms-uploads`). |
| Rate limiting | ⚠️ Partial | Code is Redis-ready (`createRedisRateLimitStore`, conditional wiring), but **no Redis service is provisioned on Railway** — production currently runs on the `ALLOW_IN_MEMORY_RATE_LIMIT` escape hatch. See `docs/CONCERNS.md` (2026-08-06) and `docs/PRODUCTION_HARDENING_BACKLOG.md` PR 123. |
| Password reset | Documented as skeleton only | Still returns `503 Service Unavailable`; see `docs/PASSWORD_RESET_STATUS.md`. Unchanged, intentional for this pilot stage. |
| Demo seed data | ✅ Done | `docs/ADMIN_DEMO_SEED.md` — guarded admin-only seed task, opt-in flag for prod, covers all 4 roles. |
| Full RBAC audit | ✅ Done | Consolidated into `docs/API_RBAC_MATRIX.md` (2026-08-06), including the `CourseAccessGuard` object-level layer that earlier audits missed. |
| Deployment | ✅ Live in production | Railway: `web`, `api`, `Postgres`, `minio` services running. Not just "foundation" — actively used throughout this session's work. |
| Notifications | 🚨 Not built | No module, no schema, no UI. Required by `docs/MVP_SCOPE_LOCK.md` §2.12 — open product question, not yet resolved. |
| Audit log | 🚨 Not built | No module, no schema. Required by `docs/MVP_SCOPE_LOCK.md` §2.13 and §5 success-criterion 17 — open product question, not yet resolved. |
| Dedicated reports module | ⚠️ Partial | No standalone `reports` API; covered functionally through admin/manager pages composing `/progress` and `/certificates`. |

## Pilot go / no-go summary

Go for a controlled technical pilot only if:

- CI is green for the pilot branch.
- Local env follows `docs/MVP_LOCAL_RUNBOOK.md`.
- Pilot data uses disposable credentials and no real secrets.
- S3-compatible storage variables are configured when upload testing is in scope.
- Known limitations are accepted: password reset skeleton behavior, no audit log, no notifications, in-memory rate limiting (Redis not yet provisioned), no dedicated reports API (covered functionally by admin/manager UI instead).

No-go if:

- CI is red.
- Required env setup is unclear.
- Seed/demo data contains real secrets or personal data.
- Tenant isolation or auth behavior is not verified for the pilot scenario.
- Upload testing is required but object storage env variables are not configured.
- A required limitation is not explicitly accepted by the pilot owner.

**[2026-08-06]** Given the table above, a controlled technical pilot is realistically go-able today — the only hard product gaps (audit log, notifications) are pilot-scale acceptable risks for known internal users, not blockers, provided the pilot owner explicitly accepts them.

## Current MVP baseline

Implemented baseline:

- Full backend API surface: auth, organizations, users, memberships, groups, courses, lessons, materials, assignments, progress, assessments, attempts, certificates.
- Refresh-token auth with server-side session revocation and `logout-all`.
- Role-policy RBAC + object-level course ownership scoping (`CourseAccessGuard`).
- Group/manager/course-instructor management (list/add/remove, soft-delete, admin UI).
- Full admin web surface: courses, course builder, lessons, materials, assessments, assignments, results/certificates, users, roles, org structure, theme settings — all localized (ru/en/kk/zh).
- Learner, instructor, and manager web surfaces.
- Centralized API error envelope, runtime env validation, safe startup error handling.
- CI gates: lint, typecheck, tests, build, Prisma generate, CodeQL, dependency audit, secret scanning.
- Storage uploads via tenant-scoped MinIO on Railway.
- Live Railway production deployment (`web`, `api`, `Postgres`, `minio`).
- Playwright browser E2E suite covering login/role redirects, admin/instructor/manager workspaces.

Known non-goals / open gaps for current MVP:

- Notifications (in-app) — scope-required, not built. Open product question.
- Audit log — scope-required, not built. Open product question.
- Full password reset delivery (skeleton only, intentional for pilot stage).
- Dedicated reports module (covered functionally by admin/manager UI).
- Redis-backed rate limiting in production (code ready, Redis not provisioned).
- Advanced analytics.

## Next planned doc/status work

1. Product decision needed: build audit log + notifications, or formally descope them from `docs/MVP_SCOPE_LOCK.md`.
2. Ops task: provision Redis on Railway and set `REDIS_URL` (`docs/PRODUCTION_HARDENING_BACKLOG.md` PR 123).
3. Re-update this dashboard once either of the above lands.
