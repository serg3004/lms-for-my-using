import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/isolated-test.js';

const organization = 'demo-company';
const password = 'Demo1234!';

// The backend's account-level login rate limit is a FIXED 60s window: the first
// login request for an account starts the window, and it does not slide or
// extend on subsequent requests (see entry.resetAt in
// createInMemoryRateLimitStore(), api-hardening.ts) — it simply expires 60s
// after that first request, however many logins landed inside it. Other E2E
// files log in as the same demo accounts (manager-workspace.spec.ts alone logs
// in as manager 4 times), so this file's login can be the 6th in someone else's
// window and get a 429 that leaves the login form on /login. A short retry
// backoff isn't reliable against a fixed window of unknown start time — only
// waiting longer than the window itself (60s) guarantees landing outside it.
//
// This only covers the 5-per-60s rule. The same account policy also has
// 10-per-15min and 20-per-hour rules; those aren't retried here (a 15-minute
// wait isn't worth it) and won't reset within a single CI run — the API
// process is fresh per job, so its in-memory rate-limit store starts empty.
// A developer re-running this suite repeatedly against the same local API
// server within 15 minutes can still exhaust those and needs to restart the
// server (or wait) rather than expect the retry to save them.
async function loginAs(page: Page, role: 'learner' | 'manager') {
  const destination = role === 'learner' ? /\/learn$/ : /\/manager\/dashboard$/;
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto('/login');
    await page.locator('input[name="organizationId"]').fill(organization);
    await page.locator('input[name="email"]').fill(`${role}@demo.com`);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    try {
      await expect(page).toHaveURL(destination, { timeout: 5000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(65_000);
    }
  }
}

function collectPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test.describe('critical frontend resilience matrix', () => {
  // All learner scenarios share a single login (rather than one per test) — the
  // backend's account-level login rate limit is 5 requests/60s
  // (DEFAULT_SENSITIVE_RATE_LIMIT_POLICY.account in api-hardening.ts), and this
  // file's six learner scenarios logging in independently reliably tripped it in CI.
  test('learner dashboard: empty state, HTTP error states, offline recovery, transport timeout', async ({ page, context }) => {
    // loginAs() may wait out the account rate-limit's fixed 60s window, and the
    // transport-timeout step below waits up to 35s for the client's own 30s
    // request timeout — budget for both in the worst case.
    test.setTimeout(150_000);
    const pageErrors = collectPageErrors(page);
    await loginAs(page, 'learner');

    await test.step('distinguishes an empty result from a failed request', async () => {
      await page.route('**/api/v1/learner-dashboard', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            coursesCount: 0,
            pendingAssignmentsCount: 0,
            availableAssessmentsCount: 0,
            certificatesCount: 0,
            continueLearning: [],
            upcomingDeadlines: [],
            recentActivity: [],
          }),
        });
      });

      await page.reload();
      await expect(page.getByText('Пока нет начатых курсов.')).toBeVisible();
      await expect(page.getByText('Нет предстоящих дедлайнов.')).toBeVisible();
      await expect(page.getByText('Активности пока нет.')).toBeVisible();
      expect(pageErrors).toEqual([]);
      await page.unroute('**/api/v1/learner-dashboard');
    });

    for (const status of [404, 429, 500]) {
      await test.step(`exposes a safe state for HTTP ${status}`, async () => {
        await page.route('**/api/v1/learner-dashboard', async (route) => {
          await route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify({ statusCode: status, error: { code: `SYNTHETIC_${status}` } }),
          });
        });

        await page.reload();
        await expect(page.getByRole('alert')).toContainText('Unable to load learner profile. Try again later.');
        expect(pageErrors).toEqual([]);
        await page.unroute('**/api/v1/learner-dashboard');
      });
    }

    await test.step('exposes a safe state while offline and recovers after reload', async () => {
      await page.route('**/api/v1/learner-dashboard', (route) => route.abort('internetdisconnected'));

      await page.reload();
      await expect(page.getByRole('alert')).toContainText('Unable to load learner profile. Try again later.');

      await page.unroute('**/api/v1/learner-dashboard');
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
      expect(pageErrors).toEqual([]);
    });

    await test.step('exposes a safe state for a transport timeout', async () => {
      // Never resolve the route so the client's own REQUEST_TIMEOUT_MS
      // AbortController (apiClient.ts, 30s) fires and converts to
      // ApiClientError(408) — a browser-level route.abort() would instead
      // exercise Chromium's own network-error handling and never touch that
      // client timeout path, so a regression there could stay undetected.
      await page.route('**/api/v1/learner-dashboard', () => new Promise(() => undefined));

      await page.reload();
      await expect(page.getByRole('alert')).toContainText('Unable to load learner profile. Try again later.', { timeout: 35_000 });
      expect(pageErrors).toEqual([]);
      await page.unroute('**/api/v1/learner-dashboard');
    });

    // Must run last: it permanently invalidates this page's session, so no
    // further authenticated steps can follow it in this test.
    await test.step('redirects to re-authentication when the refresh session itself is invalid', async () => {
      const refreshCookie = (await context.cookies()).find(({ name }) => name === 'lms_refresh_token');
      expect(refreshCookie).toBeDefined();

      // Same trick as login-role-redirect.spec.ts's expired-access-cookie test:
      // stop the mounted app before replacing the cookie so no background
      // request can slip through and refresh it before the navigation below.
      await page.goto('about:blank');
      await context.addCookies([{ ...refreshCookie!, value: 'expired.e2e.refresh-token' }]);

      const refreshRejected = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/v1/auth/refresh' && response.status() === 401,
      );

      await page.goto('/learn');

      await refreshRejected;
      await expect(page.getByRole('alert')).toContainText('Сессия истекла');
      await expect(page.locator('a[href="/login"]')).toBeVisible();
    });
  });

  test('manager assignment accepts only one rapid duplicate submit', async ({ page }) => {
    test.setTimeout(100_000); // loginAs() may wait out the account rate-limit's fixed 60s window
    const pageErrors = collectPageErrors(page);
    await loginAs(page, 'manager');
    let requests = 0;
    await page.route('**/api/v1/assignments', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      requests += 1;
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'synthetic-assignment' }),
      });
    });

    await page.getByRole('button', { name: 'Назначить обучение' }).click();
    const dialog = page.getByRole('dialog', { name: 'Назначить обучение' });
    const submit = dialog.getByRole('button', { name: 'Назначить' });
    await expect(submit).toBeEnabled();
    await dialog.locator('form').evaluate((form) => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    await expect(submit).toBeDisabled();
    await expect(page.getByRole('status')).toContainText('Обучение назначено');
    expect(requests).toBe(1);
    expect(pageErrors).toEqual([]);
  });
});
