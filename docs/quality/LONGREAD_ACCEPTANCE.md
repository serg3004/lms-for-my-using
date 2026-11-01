# Longread acceptance

PR 391 adds automated acceptance for the functionality delivered in PR 381–390. This document describes the checks; current success is established by CI on the reviewed commit, not by this page.

## Automated checks

- `apps/api/src/modules/longreads/longread-acceptance.spec.ts`: sentry for additive migrations, the block registry, seven question types, strict completion inputs and the default-off feature flag. It exercises the flag before version lookup and verifies that 100 blocks/20 file references use one metadata-only file query.
- `apps/e2e/tests/longread-acceptance.spec.ts`: real browser, real API and PostgreSQL, without route interception. An isolated author creates a draft containing text, a table, seven question formats, an attachment and two Continue blocks; publication is performed in the actual editor. The first learner completes v1 using the actual reader controls, the author publishes v2, and the second learner completes v2. The test verifies the first learner's pinned version, score, completion date, final assessment result, certificate and administrator report.
- The same chain checks draft/foreign-tenant/disabled-flag denial, unready attachment publication, unsafe HTML rejection, stale-save conflicts, exhausted attempts and concurrent repeated submissions.
- A second browser scenario saves/publishes/renders 100 blocks with 20 attachment descriptors of 50 MiB each. The published JSON must stay below 100,000 bytes and the read must finish within 10 seconds. This is a bounded-response regression budget, not a load test or an RSS benchmark.

Only fixture provisioning and cleanup use Prisma. Each scenario creates unique organizations, users and course data, logs in with real credentials, and removes its own records in `finally`. The fixture refuses non-test or non-local database targets. Ready file metadata is provisioned without binary payloads or an external object-storage dependency; uploading, quarantine, scanner verdicts and file access remain covered by `longread-files.database.spec.ts`. This suite does not claim to test actual PDF downloads.

The existing CI Browser E2E job includes both scenarios automatically. The unit job includes the sentry. Existing database, browser, accessibility and visual jobs remain required for regression coverage of courses, lessons, materials, assignments, certificates and reports. No snapshots, application UI or permissions change in PR 391.

## Running the targeted checks

```bash
pnpm --filter @lms/api exec env NODE_OPTIONS=--experimental-vm-modules jest --runInBand --runTestsByPath src/modules/longreads/longread-acceptance.spec.ts
NODE_ENV=test DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/lms_test pnpm test:e2e apps/e2e/tests/longread-acceptance.spec.ts
```

Use a disposable PostgreSQL database with all migrations applied. The standard Playwright configuration starts the API and web application and seeds its demo fixtures. Never point this command at a working or production database. No manual CI dispatch is needed for these tests.

## Owner verification — pending

Automated acceptance does not close the owner-verification item in the product plan. On the owner's course:

1. Enable longreads for the organization, open Courses → course → longread editor, and create the desired chapters, exercises, files and Continue conditions.
2. Publish v1. As an assigned learner, answer, pass Continue and complete the required chapters; check reload and the administrator's Results card.
3. Publish an edited v2. A new learner must see v2, while the first learner keeps v1 and the previous result.
4. Confirm the result explicitly. Until that confirmation, the owner item remains unchecked.

The menu label «Задание» is unchanged. Deployment and owner acceptance are separate from merging this test change.
