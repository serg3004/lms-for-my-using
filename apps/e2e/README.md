# Browser E2E

PR 388 adds `assessment-typed-compat.spec.ts`: mocked API transport verifies that legacy
option-only learner/author forms reject typed questions without starting a timed attempt,
submitting an incompatible answer or overwriting the definition (RU/EN/KK/ZH). The unavailable
learner state is covered by axe and visual snapshots at 375/1440 px. Grading, answer-key projection,
tenant/author scope, actual SQL migration and legacy result/certificate compatibility are covered
separately against PostgreSQL in `assessment-question-types.database.spec.ts`; browser mocks
are not evidence of backend authorization or seven-type longread UI support (PR 389).

Run the Chromium suite from the repository root:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Run the responsive visual matrix:

```bash
pnpm test:visual
```

The visual suite runs independently from the database-backed functional suite. It intercepts API calls with fixed synthetic `.invalid` data, captures named screenshots at 320, 375, 768, 1024, 1280, and 1440 px, and checks explicit layout baselines for page overflow, mobile touch targets, dialogs, and 200% zoom. CI retains screenshots, traces, and the rendered report when a baseline fails.

The instructor and mentor session-management shells have separate baselines at all six widths: populated session list, creation wizard, time/observer editing, and completed-session report. They use `fixtures/session-management.ts` with read-only API responses, independent of the conduct queue and shared demo logins. Each screenshot remains a required assertion; a soft screenshot assertion lets the same scenario report differences in all four states.

The observation-sheet preview uses a synthetic 5S fixture (2 groups, 27 criteria; no owner data).
Functional checks cover local-only traffic, radio arrow keys, focus boundaries/Escape/restoration,
reset/reopen, conditional sections, required fields and RU/EN/KK/ZH controls. Visual captures at
all six widths cover the top of the full-screen page, criteria and the feedback/result area;
the dialog scrolls internally. These viewport captures use a 3000-pixel difference budget
(existing visual scenarios retain their budget). Axe audits at 375/1440 px scope the active native modal, whose
background is inert; existing whole-page audits keep their scope and severity gate.

Session-summary downloads (PR 373) use the anonymized `tests/fixtures/checklist-session-summary-5s.json`
reference: 27 criteria, 71/79 points, two groups. Browser checks parse actual Excel/CSV downloads
from admin/instructor/mentor shells, verify reference cells, merged score headings, freeze panes
and grey headers without criterion fills, and exercise errors/retry, busy controls, hidden results,
unfinished sessions and RU/EN/KK/ZH controls. ExcelJS is a test-only E2E dependency. API unit and
Postgres tests separately validate the exact table, scoring, authorization, limits and durable audit;
mocked browser downloads do not replace those server checks.

## Accessibility baseline

Longread entrypoint scenarios cover the unchanged Activity/«Задание» sidebar label, the shared organization setting
on the course list, course builder and lesson page, a localized-title draft creation from Courses, existing editor
links, unsaved course fields, disable/re-enable, error/retry, admin-only controls, RU/EN/KK/ZH and the mobile drawer.
These use synthetic API responses; backend tenant/role enforcement remains covered by API/database tests. The three
setting surfaces have separate visual and axe checks at 375/1440 px.

Run `pnpm test:a11y` from the repository root. The suite audits public pages and every role workspace with axe, fails on critical, serious, or moderate WCAG 2.1 AA violations (the moderate baseline is zero), and checks core keyboard/focus flows plus a 320 px/200% zoom scenario. Every audit logs counts and produces a JSON report grouped by severity; CI retains those reports even when the gate passes. Minor findings are reported without blocking the build. See the [accessibility exception policy](../../docs/quality/ACCESSIBILITY.md).

Session-management audits cover instructor and mentor at 375/1440 px: list, creation/edit dialogs, and report summary, participants, criteria and history. Each state writes its own JSON report; the checks also exercise Escape, focus restoration and keyboard tab activation.

Playwright builds the API, runs the guarded `admin:demo-seed` task with confirmations derived from the non-production `NODE_ENV` and parsed `DATABASE_URL`, and then starts the API and Vite development servers. A local PostgreSQL database matching `DATABASE_URL` must be available and migrated. Existing local servers are reused; when reusing them, apply the guarded seed as documented in `docs/ADMIN_DEMO_SEED.md` first. CI always starts clean server processes.

The login suite exercises the real form, development proxy, API cookies, role guards, and refresh-session rotation for the four demo roles. The manager suite verifies dashboard aggregates and team scope against the real seeded API, covers loading/error/empty states with controlled responses, and attaches desktop/mobile screenshots to its Playwright result. The instructor suite covers the dashboard-to-course-students journey, isolated course create/edit cleanup, validation and API failures, duplicate slugs, progress, and UI/API ownership enforcement. Keep the demo identities test-only and never replace them with production credentials.

## Isolation and artifact policy

PR 387 playback fixtures use ffmpeg-generated synthetic MP3/WAV (45 seconds of tone) and silent MP4/WebM (3 seconds)
under `fixtures/assets/`. Tests decode/play/seek actual bytes via a range-capable mocked transport. They cover
keyboard/volume/mute/shared speed, signed-URL expiry/access loss, poster/upload/editor persistence, approved iframe
resolution and fallback, preview isolation and RU/EN/KK/ZH. The production CSP probe reads the actual nginx header
file and exercises media Range, storage PUT and allowed/blocked frame origins in a synthetic document. It does not
claim a live external-provider/scanner/CORS check. Separate reader/editor axe and visual scenarios use paused media
and deterministic provider frames; PostgreSQL tests enforce ownership, scan state and version retention.

- Tests run in independent browser contexts, and the `isolatedUser` fixture derives a unique synthetic `.invalid` identity from the worker and test IDs.
- The manager workspace suite authenticates once through the real login form, then copies its test-only cookies in memory into each scenario's fresh context. Its four workspace checks retain independent local storage and route mocks without consuming four account login attempts. No authenticated state file is written; login response status is asserted before checking the redirect.
- Tests that create persistent records must use that fixture and delete those records during fixture teardown. Tests must not depend on execution order or data created by another test.
- Retries are intentionally disabled. A flaky failure remains a failed run.
- Traces, screenshots, and video are retained only for failures, ignored by Git, and retained in CI for seven days.
- Never put production credentials, bearer tokens, personal data, or a reusable authenticated `storageState` in E2E input or attachments. Use test-only accounts and redact response data before manually attaching it.
