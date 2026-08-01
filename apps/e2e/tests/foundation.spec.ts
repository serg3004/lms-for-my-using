import { expect, test } from '../fixtures/isolated-test.js';

test.describe('browser E2E foundation', () => {
  test('keeps every test identity isolated', async ({ isolatedUser }) => {
    expect(isolatedUser.email).toMatch(/^e2e\+.+@example\.invalid$/);
    expect(isolatedUser.externalId).toMatch(/^e2e-/);
  });

  test('serves the app and preserves browser history navigation', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/');
    await expect(page).toHaveURL('http://127.0.0.1:5173/');

    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);

    await page.goForward();
    await expect(page).toHaveURL('http://127.0.0.1:5173/');
  });

  test('forwards API calls through the development proxy', async ({ page }) => {
    await page.goto('/login');

    const response = await page.evaluate(async () => {
      const result = await fetch('/api/v1/health/live');
      return { body: await result.json(), status: result.status };
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok' });
  });

  test('uses a fresh cookie jar for each browser context', async ({ context, page }) => {
    await context.addCookies([
      {
        name: 'e2e-isolation',
        value: 'synthetic-test-value',
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    await page.goto('/login');
    await expect.poll(async () => (await context.cookies()).some(({ name }) => name === 'e2e-isolation')).toBe(true);
  });

  test('does not inherit cookies from another test', async ({ context }) => {
    expect((await context.cookies()).find(({ name }) => name === 'e2e-isolation')).toBeUndefined();
  });
});
