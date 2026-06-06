import { expect, test } from '@playwright/test';

const apiBaseUrl = process.env.E2E_API_URL ?? 'https://api-production-2938.up.railway.app';

test('API health check returns ok', async ({ request }) => {
  // Poll up to 60 s to allow Railway cold starts and in-flight deployments
  const deadline = Date.now() + 60_000;
  let response = await request.get(`${apiBaseUrl}/api/v1/health`, { timeout: 15_000 });

  while (response.status() !== 200 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5_000));
    response = await request.get(`${apiBaseUrl}/api/v1/health`, { timeout: 15_000 });
  }

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'ok' });
});

test('login page renders all required fields', async ({ page }) => {
  await page.goto('/login');

  await expect(page.locator('input[name="organizationId"]')).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});

test('unauthenticated access to /learn redirects to /login', async ({ page }) => {
  await page.goto('/learn');
  await page.waitForURL(/\/login/);

  expect(page.url()).toContain('/login');
});

test('submitting empty login form shows field validation errors', async ({ page }) => {
  await page.goto('/login');
  // Disable HTML5 native validation so React's own validation fires
  await page.locator('form').evaluate((f: HTMLFormElement) => f.setAttribute('novalidate', ''));
  await page.locator('button[type="submit"]').click();

  await expect(page.locator('[role="alert"]').first()).toBeVisible();
});

test('root page links to login when unauthenticated', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('a[href="/login"]')).toBeVisible();
});
