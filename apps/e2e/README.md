# Browser E2E

Run the Chromium suite from the repository root:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Playwright builds the API, runs the guarded `admin:demo-seed` task with confirmations derived from the non-production `NODE_ENV` and parsed `DATABASE_URL`, and then starts the API and Vite development servers. A local PostgreSQL database matching `DATABASE_URL` must be available and migrated. Existing local servers are reused; when reusing them, apply the guarded seed as documented in `docs/ADMIN_DEMO_SEED.md` first. CI always starts clean server processes.

The login suite exercises the real form, development proxy, API cookies, role guards, and refresh-session rotation for the four demo roles. The manager suite verifies dashboard aggregates and team scope against the real seeded API, covers loading/error/empty states with controlled responses, and attaches desktop/mobile screenshots to its Playwright result. The instructor suite covers the dashboard-to-course-students journey, isolated course create/edit cleanup, validation and API failures, duplicate slugs, progress, and UI/API ownership enforcement. Keep the demo identities test-only and never replace them with production credentials.

## Isolation and artifact policy

- Tests run in independent browser contexts, and the `isolatedUser` fixture derives a unique synthetic `.invalid` identity from the worker and test IDs.
- Tests that create persistent records must use that fixture and delete those records during fixture teardown. Tests must not depend on execution order or data created by another test.
- Retries are intentionally disabled. A flaky failure remains a failed run.
- Traces, screenshots, and video are retained only for failures, ignored by Git, and retained in CI for seven days.
- Never put production credentials, bearer tokens, personal data, or a reusable authenticated `storageState` in E2E input or attachments. Use test-only accounts and redact response data before manually attaching it.
