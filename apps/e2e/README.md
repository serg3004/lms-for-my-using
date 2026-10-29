# Browser E2E

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

## Accessibility baseline

Run `pnpm test:a11y` from the repository root. The suite audits public pages and every role workspace with axe, fails on critical, serious, or moderate WCAG 2.1 AA violations (the moderate baseline is zero), and checks core keyboard/focus flows plus a 320 px/200% zoom scenario. Every audit logs counts and produces a JSON report grouped by severity; CI retains those reports even when the gate passes. Minor findings are reported without blocking the build. See the [accessibility exception policy](../../docs/quality/ACCESSIBILITY.md).

Session-management audits cover instructor and mentor at 375/1440 px: list, creation/edit dialogs, and report summary, participants, criteria and history. Each state writes its own JSON report; the checks also exercise Escape, focus restoration and keyboard tab activation.

Playwright builds the API, runs the guarded `admin:demo-seed` task with confirmations derived from the non-production `NODE_ENV` and parsed `DATABASE_URL`, and then starts the API and Vite development servers. A local PostgreSQL database matching `DATABASE_URL` must be available and migrated. Existing local servers are reused; when reusing them, apply the guarded seed as documented in `docs/ADMIN_DEMO_SEED.md` first. CI always starts clean server processes.

The login suite exercises the real form, development proxy, API cookies, role guards, and refresh-session rotation for the four demo roles. The manager suite verifies dashboard aggregates and team scope against the real seeded API, covers loading/error/empty states with controlled responses, and attaches desktop/mobile screenshots to its Playwright result. The instructor suite covers the dashboard-to-course-students journey, isolated course create/edit cleanup, validation and API failures, duplicate slugs, progress, and UI/API ownership enforcement. Keep the demo identities test-only and never replace them with production credentials.

## Isolation and artifact policy

- Tests run in independent browser contexts, and the `isolatedUser` fixture derives a unique synthetic `.invalid` identity from the worker and test IDs.
- The manager workspace suite authenticates once through the real login form, then copies its test-only cookies in memory into each scenario's fresh context. Its four workspace checks retain independent local storage and route mocks without consuming four account login attempts. No authenticated state file is written; login response status is asserted before checking the redirect.
- Tests that create persistent records must use that fixture and delete those records during fixture teardown. Tests must not depend on execution order or data created by another test.
- Retries are intentionally disabled. A flaky failure remains a failed run.
- Traces, screenshots, and video are retained only for failures, ignored by Git, and retained in CI for seven days.
- Never put production credentials, bearer tokens, personal data, or a reusable authenticated `storageState` in E2E input or attachments. Use test-only accounts and redact response data before manually attaching it.
