# PR 89–102 Verification Status

Document status: docs-only  
Scope: verification of the factual repository state for PR 89–102 before continuing MVP/Railway work.

This document records what is already present in `main`, what is only partially confirmed, and what still needs implementation or real environment validation. It does not change runtime code, Prisma schema, migrations, CI/CD, env values, secrets, Dockerfiles, or Railway config.

## Verification sources

Checked repository areas:

- `docs/DEVELOPMENT_PLAN.md`
- `docs/TODO_VERIFY.md`
- `docs/DEPLOY_FOUNDATION.md`
- `docs/MIGRATION_BACKUP_POLICY.md`
- `docs/ARCHITECTURE_MODULE_BOUNDARIES.md`
- `apps/api/railway.json`
- `apps/web/railway.json`
- `.env.production.example`
- `apps/api/src/app.module.ts`
- `apps/api/src/modules`
- `apps/api/src/modules/course-materials`
- `apps/api/src/modules/assessment-attempts`
- `apps/api/src/modules/certificates`
- `apps/api/prisma/seed.mjs`
- `apps/web/src/app`
- `apps/web/src/app/App.tsx`
- `apps/web/src/shared`
- `apps/web/src/shared/api`

No local build, tests, seed, Docker build, or Railway deploy was run during this verification.

## Summary

| Planned PR | Title | Current repository status | Remaining work |
|---|---|---|---|
| PR 89 | Railway configuration | Mostly present by files | Verify real Railway project/service config and staging deploy behavior. |
| PR 90 | Production environment setup | Mostly present by docs/example file | Verify runtime env requirements against deployed Railway variables. |
| PR 91 | Admin user management UI | Page/route present | Verify full CRUD behavior against backend and add/fix tests if gaps exist. |
| PR 92 | Admin course management UI | Page/route present | Verify create/status/update behavior against backend. |
| PR 93 | Admin lesson management UI | Page/route present | Verify course-scoped lesson create/order/edit behavior. |
| PR 94 | Admin materials management UI links only | Page/route present | Verify links-only flow; do not mix with file upload scope. |
| PR 95 | Admin assignment management UI | Page/route present | Verify assignment creation/cancel/list behavior and API contract. |
| PR 96 | Admin assessment builder UI | Page/route present | Verify question/options/publish flow and API contract. |
| PR 97 | Backend file upload service S3-compatible | Not confirmed as implemented | Implement or explicitly defer upload API/module. |
| PR 98 | Frontend file upload in admin materials | Not confirmed as implemented | Depends on PR 97; implement or defer. |
| PR 99 | Learner lesson completion flow | Page/route present | Verify completion POST/progress recalculation/idempotency. |
| PR 100 | Learner assessment taking real | Page/route present | Verify real attempt submission, result display, and maxAttempts behavior. |
| PR 101 | Auto certificate issuance after assessment pass | Certificate page/service present, auto issuance not confirmed | Verify backend auto issuance after passed attempt; fix if missing. |
| PR 102 | Complete demo seed data | Partially present | Seed creates demo data, but differs from original plan; verify idempotent real run and demo flow. |

## Detailed findings

### PR 89 — Railway configuration

Status: **mostly present, requires real environment verification**.

Present in repository:

- `apps/api/railway.json`
- `apps/web/railway.json`
- `infra/railway/README.md`
- API Railway config uses Dockerfile builder.
- API start command runs `prisma migrate deploy` before `node dist/main.js`.
- API healthcheck path is `/api/v1/health`.
- Web Railway config uses Dockerfile builder.
- Web healthcheck path is `/`.

Remaining verification:

- Confirm Railway has two services wired to the intended paths/configs.
- Confirm Railway PostgreSQL plugin is attached to API via `DATABASE_URL`.
- Confirm API build image contains Prisma CLI/client as expected for the configured start command.
- Confirm healthchecks pass in real Railway staging.
- Confirm migrations do not run against the wrong database.
- Confirm no root `railway.json` is required for the actual project setup.

### PR 90 — Production environment setup

Status: **mostly present, requires runtime/env verification**.

Present in repository:

- `.env.production.example`
- `NODE_ENV=production`
- `DATABASE_URL` placeholder
- `JWT_SECRET` placeholder with generation note
- `FRONTEND_URL` placeholder
- optional S3-compatible variables:
  - `S3_ENDPOINT`
  - `S3_REGION`
  - `S3_BUCKET`
  - `S3_ACCESS_KEY_ID`
  - `S3_SECRET_ACCESS_KEY`

Remaining verification:

- Confirm actual API runtime config validates all required production variables.
- Confirm Railway dashboard variables match `.env.production.example`.
- Confirm CORS uses the deployed web URL.
- Confirm storage variables are either intentionally blank/disabled or supported by implemented upload code.
- Confirm first deploy flow: deploy -> migrate -> seed, but do not run seed automatically in production without explicit approval.

### PR 91 — Admin user management UI

Status: **page and route present, full behavior not confirmed**.

Present in repository:

- `apps/web/src/app/AdminUsersPage.tsx`
- route `/admin/users` in `App.tsx`
- shared admin page toolkit exists under `apps/web/src/shared/adminPage.tsx`
- backend users module exists under `apps/api/src/modules/users`

Remaining verification:

- Confirm list/create/deactivate behavior matches backend contract.
- Confirm validation/error states are consistent with current frontend validation standard.
- Confirm role/status fields align with backend enums/contracts.
- Confirm tests cover at least happy path and one negative path if behavior changes.

### PR 92 — Admin course management UI

Status: **page and route present, full behavior not confirmed**.

Present in repository:

- `apps/web/src/app/AdminCourseBuilderPage.tsx`
- route `/admin/courses` in `App.tsx`
- backend courses module exists under `apps/api/src/modules/courses`

Remaining verification:

- Confirm course create/list/status behavior.
- Confirm status transitions match backend.
- Confirm frontend wrapper/types match API response shape.
- Confirm tests cover practical behavior if changes are needed.

### PR 93 — Admin lesson management UI

Status: **page and route present, full behavior not confirmed**.

Present in repository:

- `apps/web/src/app/AdminLessonsPage.tsx`
- route `/admin/lessons` in `App.tsx`
- backend lessons module exists under `apps/api/src/modules/lessons`
- typed frontend lessons API wrapper exists under `apps/web/src/shared/api/lessons.ts`

Remaining verification:

- Confirm course-scoped lesson list/create behavior.
- Confirm ordering behavior exists or is intentionally out of scope.
- Confirm edit behavior if the page claims to support it.
- Confirm contract and tests if behavior changes.

### PR 94 — Admin materials management UI links only

Status: **page and route present, full behavior not confirmed**.

Present in repository:

- `apps/web/src/app/AdminMaterialsPage.tsx`
- route `/admin/materials` in `App.tsx`
- backend course-materials module exists under `apps/api/src/modules/course-materials`
- frontend materials API wrapper exists under `apps/web/src/shared/api/materials.ts`

Remaining verification:

- Confirm this PR remains links-only.
- Confirm material create/list/delete behavior.
- Confirm `fileUrl`, `kind`, `mimeType`, and status handling align with backend schema.
- Confirm no incomplete file-upload UI is exposed before backend upload support is implemented.

### PR 95 — Admin assignment management UI

Status: **page and route present, full behavior not confirmed**.

Present in repository:

- `apps/web/src/app/AdminAssignmentCompletionPage.tsx`
- route `/admin/assignments` in `App.tsx`
- backend assignments module exists under `apps/api/src/modules/assignments`
- frontend assignments API wrapper exists under `apps/web/src/shared/api/assignments.ts`

Remaining verification:

- Confirm assignment list/create/cancel flow.
- Confirm group/user targeting behavior.
- Confirm deadline/status behavior.
- Confirm page name still matches function or should be renamed in a later cleanup PR.

### PR 96 — Admin assessment builder UI

Status: **page and route present, full behavior not confirmed**.

Present in repository:

- `apps/web/src/app/AdminAssessmentBuilderPage.tsx`
- route `/admin/assessments` in `App.tsx`
- backend assessments and assessment-questions modules exist.
- frontend assessments API wrapper exists under `apps/web/src/shared/api/assessments.ts`

Remaining verification:

- Confirm create assessment flow.
- Confirm question creation/options behavior.
- Confirm publish/archive behavior if supported.
- Confirm validation and tests if runtime behavior changes.

### PR 97 — Backend file upload service S3-compatible

Status: **not confirmed as implemented**.

Present in repository:

- `course-materials` module supports metadata/material records.
- `.env.production.example` documents optional S3-compatible variables.

Not found/confirmed from checked files:

- A dedicated upload module under `apps/api/src/modules/upload`.
- A `POST /api/v1/upload` implementation.
- S3/R2/MinIO storage service implementation.
- Multipart upload handling.
- Presigned URL service.
- Upload tests.

Remaining work:

- Either implement a scoped backend upload API/service with validation and tests, or explicitly defer file upload beyond MVP.
- Do not add real S3 secrets.
- Do not change Prisma schema unless the existing `CourseMaterial.fileUrl` is insufficient and the schema change is explicitly approved.

### PR 98 — Frontend file upload in admin materials

Status: **not confirmed as implemented**.

Present in repository:

- `AdminMaterialsPage.tsx`
- material API wrapper exists.

Remaining work:

- Depends on PR 97.
- Add file picker/progress/error states only after backend upload contract exists.
- Save returned `fileUrl` into material.
- Show learner download/link behavior.
- Add tests.

Recommended decision:

- Do not start PR 98 before PR 97 contract exists.

### PR 99 — Learner lesson completion flow

Status: **page and route present, full behavior not confirmed**.

Present in repository:

- `apps/web/src/app/LearnerLessonDetailPage.tsx`
- route `/learn/lessons/:lessonId` in `App.tsx`
- backend progress module exists under `apps/api/src/modules/progress`
- frontend progress API wrapper exists under `apps/web/src/shared/api/progress.ts`

Remaining verification:

- Confirm “complete lesson” action calls the expected backend endpoint.
- Confirm progress recalculation behavior.
- Confirm idempotency for repeated completion.
- Confirm tests cover completion and duplicate completion if changes are made.

### PR 100 — Learner assessment taking real

Status: **page and route present, full behavior not confirmed**.

Present in repository:

- `apps/web/src/app/LearnerAssessmentTakingPage.tsx`
- route `/learn/assessments/:assessmentId/take` in `App.tsx`
- backend assessment-attempts module exists.
- assessment-attempts service and tests exist.
- assessment results service and tests exist.

Remaining verification:

- Confirm frontend sends real answers to backend attempt endpoint.
- Confirm result display uses backend result shape.
- Confirm maxAttempts blocking behavior.
- Confirm negative/error states.

### PR 101 — Auto certificate issuance after assessment pass

Status: **partially present, auto issuance not confirmed**.

Present in repository:

- `apps/web/src/app/LearnerCertificateDetailPage.tsx`
- route `/learn/certificates/:certificateId` in `App.tsx`
- backend certificates module/service/tests exist.
- seed data includes an issued certificate linked to a passed attempt.

Remaining verification:

- Confirm assessment attempt service automatically issues a certificate after a passed attempt.
- Confirm failure path does not issue a certificate.
- Confirm idempotency: repeated passed attempts should not create duplicate certificates unless business rules allow it.
- Confirm frontend certificate detail page supports the intended HTML/print flow.

Recommended decision:

- If auto issuance is missing, implement a small backend-focused PR with tests before PR 103.

### PR 102 — Complete demo seed data

Status: **partially present, real seed run not verified**.

Present in repository:

- `apps/api/prisma/seed.mjs`
- deterministic IDs
- demo organization
- admin, instructor, and two learners
- group
- one published course
- two published lessons
- one link material
- assignment
- completed learner progress records
- one assessment
- one question
- correct/wrong answer options
- passed attempt
- issued certificate
- idempotent-style `createMany(... skipDuplicates: true)` usage

Difference from original plan:

- Original plan mentioned 3 lessons; current seed has 2 lessons.
- Original plan mentioned 5 questions; current seed has 1 question.
- Original plan mentioned passing score 60%; current seed uses 70%.
- Current demo emails are `*.mvp@example.test`, not `admin@demo.com` / `learner@demo.com`.

Remaining verification:

- Run seed against a disposable database.
- Confirm seed is safely repeatable.
- Confirm demo credentials work.
- Confirm full demo learner flow is available after seed.
- Decide whether the current smaller seed is acceptable for MVP or should be expanded to match the original plan.

## Recommended next PR order

1. **PR 97 decision** — choose whether file upload is required for MVP.
   - If yes: implement backend upload service first.
   - If no: explicitly defer file upload and keep links-only materials for MVP.

2. **PR 101 verification/fix** — verify backend auto certificate issuance after passed assessment.
   - This is more MVP-critical than frontend polish.

3. **PR 102 seed alignment** — decide whether to expand seed to match original plan or update plan/docs to current smaller seed.

4. **PR 103 Railway staging deploy + full MVP smoke** — run real deploy and smoke only after the above blockers are resolved or explicitly deferred.

## Current blocker list before PR 103

- Real Railway staging deploy not yet confirmed.
- S3-compatible file upload not confirmed as implemented.
- Auto certificate issuance after assessment pass not confirmed.
- Demo seed does not exactly match the original PR 102 target.
- Admin CRUD and learner flows have pages/routes, but runtime completeness has not been verified end-to-end.
- Full MVP smoke has not been run against Railway.

## Non-goals of this verification PR

- No runtime code changes.
- No Prisma schema or migration changes.
- No Dockerfile or Railway config changes.
- No env value or secret changes.
- No API contract changes.
- No admin/learner UI changes.
- No tests added or modified.
