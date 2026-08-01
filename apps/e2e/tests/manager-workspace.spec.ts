import type { Page, TestInfo } from '@playwright/test';

import { expect, test } from '../fixtures/isolated-test.js';

const organization = 'demo-company';
const password = 'Demo1234!';
const outOfTeamUserId = '10000000-0000-4000-8000-000000000011';

async function loginAsManager(page: Page) {
  await page.goto('/login');
  await page.locator('input[name="organizationId"]').fill(organization);
  await page.locator('input[name="email"]').fill('manager@demo.com');
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/manager\/dashboard$/);
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}

test.describe('manager workspace', () => {
  test('shows real dashboard aggregates and attaches a desktop screenshot', async ({ page }, testInfo) => {
    await loginAsManager(page);

    const assignmentsResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/v1/assignments?') && response.status() === 200,
    );
    await page.reload();
    const assignments = await (await assignmentsResponsePromise).json() as {
      items: Array<{ status: string }>;
      total: number;
    };

    expect(assignments).toMatchObject({ total: 1, items: [{ status: 'assigned' }] });
    await expect(page.getByRole('heading', { name: 'Дашборд менеджера' })).toBeVisible();
    await expect(page.getByText('Всего назначений').locator('..').getByText('1', { exact: true })).toBeVisible();
    await expect(page.getByText('В процессе').locator('..').getByText('1', { exact: true })).toBeVisible();
    await expect(page.getByText('Завершено').locator('..').getByText('0', { exact: true })).toBeVisible();
    await expect(page.getByText('Просрочено').locator('..').getByText('0', { exact: true })).toBeVisible();

    await attachScreenshot(page, testInfo, 'manager-dashboard-desktop');
  });

  test('shows only the managed team, denies an out-of-team user, and attaches a mobile screenshot', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await page.setViewportSize({ width: 375, height: 812 });

    const usersResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/v1/users?') && response.status() === 200,
    );
    await page.goto('/manager/team');
    const users = await (await usersResponsePromise).json() as {
      items: Array<{ email: string }>;
      total: number;
    };

    expect(users).toEqual(expect.objectContaining({
      total: 1,
      items: [expect.objectContaining({ email: 'learner@demo.com' })],
    }));
    await expect(page.getByRole('heading', { name: 'Команда' })).toBeVisible();
    await expect(page.getByText('Всего сотрудников: 1')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'learner@demo.com' })).toBeVisible();
    await expect(page.getByText('admin@demo.com')).toHaveCount(0);

    const forbiddenUser = await page.evaluate(async (userId) => {
      const response = await fetch(`/api/v1/users/${userId}`);
      return { body: await response.json(), status: response.status };
    }, outOfTeamUserId);
    expect(forbiddenUser).toMatchObject({
      status: 404,
      body: { error: { code: 'NOT_FOUND' }, statusCode: 404 },
    });

    await attachScreenshot(page, testInfo, 'manager-team-mobile');
  });

  test('renders the dashboard loading and error states', async ({ page }) => {
    await loginAsManager(page);
    await page.route('**/api/v1/assignments?*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 750));
      await route.continue();
    });

    await page.goto('/manager/dashboard');
    await expect(page.getByRole('status')).toHaveText('Загрузка...');
    await expect(page.getByRole('heading', { name: 'Дашборд менеджера' })).toBeVisible();

    await page.unroute('**/api/v1/assignments?*');
    await page.route('**/api/v1/assignments?*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Synthetic manager dashboard failure' }),
      });
    });
    await page.reload();
    await expect(page.getByRole('alert')).toHaveText('Не удалось загрузить данные. Попробуйте позже.');
  });

  test('renders the empty team state', async ({ page }) => {
    await loginAsManager(page);
    const emptyPage = JSON.stringify({ items: [], page: 1, pageSize: 200, total: 0 });
    await page.route('**/api/v1/users?*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: emptyPage });
    });
    await page.route('**/api/v1/progress?*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: emptyPage });
    });

    await page.goto('/manager/team');
    await expect(page.getByText('Всего сотрудников: 0')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Нет сотрудников' })).toBeVisible();
  });
});
