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

## Accessibility baseline

Run `pnpm test:a11y` from the repository root. The suite audits public pages and every role workspace with axe, fails on serious or critical WCAG 2.1 AA violations, and checks core keyboard/focus flows. The exception policy is documented in `docs/ACCESSIBILITY.md`.

Playwright builds the API, runs the guarded `admin:demo-seed` task with confirmations derived from the non-production `NODE_ENV` and parsed `DATABASE_URL`, and then starts the API and Vite development servers. A local PostgreSQL database matching `DATABASE_URL` must be available and migrated. Existing local servers are reused; when reusing them, apply the guarded seed as documented in `docs/ADMIN_DEMO_SEED.md` first. CI always starts clean server processes.

The login suite exercises the real form, development proxy, API cookies, role guards, and refresh-session rotation for the four demo roles. The manager suite verifies dashboard aggregates and team scope against the real seeded API, covers loading/error/empty states with controlled responses, and attaches desktop/mobile screenshots to its Playwright result. The instructor suite covers the dashboard-to-course-students journey, isolated course create/edit cleanup, validation and API failures, duplicate slugs, progress, and UI/API ownership enforcement. Keep the demo identities test-only and never replace them with production credentials.

## Isolation and artifact policy

- Tests run in independent browser contexts, and the `isolatedUser` fixture derives a unique synthetic `.invalid` identity from the worker and test IDs.
- Tests that create persistent records must use that fixture and delete those records during fixture teardown. Tests must not depend on execution order or data created by another test.
- Retries are intentionally disabled. A flaky failure remains a failed run.
- Traces, screenshots, and video are retained only for failures, ignored by Git, and retained in CI for seven days.
- Never put production credentials, bearer tokens, personal data, or a reusable authenticated `storageState` in E2E input or attachments. Use test-only accounts and redact response data before manually attaching it.
