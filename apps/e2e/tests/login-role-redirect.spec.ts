import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/isolated-test.js';

const organization = 'demo-company';
const password = 'Demo1234!';

type DemoRole = 'admin' | 'manager' | 'instructor' | 'learner';

const roleDestinations: Array<{ role: DemoRole; destination: string }> = [
  { role: 'admin', destination: '/admin' },
  { role: 'manager', destination: '/manager/dashboard' },
  { role: 'instructor', destination: '/instructor/dashboard' },
  { role: 'learner', destination: '/learn' },
];

async function loginAs(page: Page, role: DemoRole) {
  await page.goto('/login');
  await page.locator('input[name="organizationId"]').fill(organization);
  await page.locator('input[name="email"]').fill(`${role}@demo.com`);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
}

test.describe('login and role redirects', () => {
  for (const { role, destination } of roleDestinations) {
    test(`${role} signs in to the correct workspace without a redirect loop`, async ({ page }) => {
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
    await loginAs(page, 'learner');
    await expect(page).toHaveURL(/\/learn$/);

    const accessCookie = (await context.cookies()).find(({ name }) => name === 'lms_access_token');
    expect(accessCookie).toBeDefined();
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
