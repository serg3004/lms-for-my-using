import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/isolated-test.js';

const organization = 'demo-company';
const password = 'Demo1234!';

type DemoRole = 'admin' | 'manager' | 'instructor' | 'mentor' | 'learner';

const roleDestinations: Array<{ role: DemoRole; destination: string }> = [
  { role: 'admin', destination: '/admin' },
  { role: 'manager', destination: '/manager/dashboard' },
  { role: 'instructor', destination: '/instructor/dashboard' },
  { role: 'mentor', destination: '/mentor' },
  { role: 'learner', destination: '/learn' },
];

const destinationByRole = new Map(roleDestinations.map(({ role, destination }) => [role, destination]));

// The backend's account-level login rate limit is a FIXED 60s window (see
// resilience-matrix.spec.ts for the full rationale): other E2E files log in as these same
// demo accounts too, so this file's login can be the 6th in someone else's window and get a
// 429 that leaves the login form on /login. Only waiting out the full window (60s) reliably
// clears it, so retry once after a 65s backoff instead of failing outright.
async function loginAs(page: Page, role: DemoRole) {
  const destination = destinationByRole.get(role)!;
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto('/login');
    await page.locator('input[name="organizationId"]').fill(organization);
    await page.locator('input[name="email"]').fill(`${role}@demo.com`);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    try {
      await expect(page).toHaveURL(new RegExp(`${destination.replace('/', '\\/')}$`), { timeout: 5000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(65_000);
    }
  }
}

test.describe('login and role redirects', () => {
  for (const { role, destination } of roleDestinations) {
    test(`${role} signs in to the correct workspace without a redirect loop`, async ({ page }) => {
      // A rate-limit retry inside loginAs can wait out a 65s backoff; budget well past the
      // default 30s so that wait doesn't itself time out the test.
      test.setTimeout(90_000);

      await loginAs(page, role);
      await expect(page).toHaveURL(new RegExp(`${destination.replace('/', '\\/')}$`));
      await page.waitForTimeout(500);

      expect(new URL(page.url()).pathname).toBe(destination);
    });
  }

  test('a guest is returned to login from a protected route', async ({ page }) => {
    await page.goto('/learn/courses');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('form input[name="organizationId"]')).toBeVisible();
  });

  test('a learner sees the forbidden contract for the admin workspace and API', async ({ page }) => {
    test.setTimeout(90_000);

    await loginAs(page, 'learner');
    await expect(page).toHaveURL(/\/learn$/);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Доступ запрещён' })).toBeVisible();
    await expect(page.getByText('У вашей учётной записи нет прав для просмотра этой страницы.')).toBeVisible();

    const forbiddenResponse = await page.evaluate(async () => {
      const response = await fetch('/api/v1/users');
      return { body: await response.json(), status: response.status };
    });

    expect(forbiddenResponse).toMatchObject({
      status: 403,
      body: { error: { code: 'FORBIDDEN' }, statusCode: 403 },
    });
  });

  test('an expired access cookie is refreshed before the protected route renders', async ({ context, page }) => {
    // This test's assertions depend on three sequential real network round-trips (401 on
    // /auth/me -> POST /auth/refresh -> retry /auth/me) plus the React re-renders between
    // them, and loginAs can also wait out a 65s rate-limit backoff -- budget for both instead
    // of sharing the default 30s margin every other test here gets.
    test.setTimeout(150_000);

    await loginAs(page, 'learner');
    await expect(page).toHaveURL(/\/learn$/);

    const accessCookie = (await context.cookies()).find(({ name }) => name === 'lms_access_token');
    expect(accessCookie).toBeDefined();

    // Stop the authenticated app before replacing its access cookie. Otherwise the already
    // mounted learner page can issue a background API request in the small window between
    // addCookies() and waitForResponse(), refresh the cookie early, and make the later
    // navigation skip the 401 -> refresh sequence this test is supposed to observe.
    await page.goto('about:blank');
    await context.addCookies([{ ...accessCookie!, value: 'expired.e2e.access-token' }]);

    const refreshResponses: number[] = [];
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/api/v1/auth/refresh') refreshResponses.push(response.status());
    });

    // Wait on each network round-trip separately (registered before the navigation that
    // triggers them) so a failure names exactly which step stalled, instead of a single
    // expect.poll timing out over the whole chain with no indication of where it broke.
    const expiredAccessRejected = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/v1/auth/me' && response.status() === 401,
    );
    const refreshSucceeded = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/v1/auth/refresh' && response.status() === 201,
    );
    const retrySucceeded = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/v1/auth/me' && response.status() === 200,
    );

    await page.goto('/learn/courses');

    await expiredAccessRejected;
    await refreshSucceeded;
    await retrySucceeded;
    await expect(page).toHaveURL(/\/learn\/courses$/);

    expect(refreshResponses).toEqual([201]);
  });
});
