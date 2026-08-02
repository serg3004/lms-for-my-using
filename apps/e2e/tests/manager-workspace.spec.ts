import type { Page, TestInfo } from '@playwright/test';

import { expect, test } from '../fixtures/isolated-test.js';

const organization = 'demo-company';
const password = 'Demo1234!';
const outOfTeamUserId = '10000000-0000-4000-8000-000000000011';

function isApiPath(url: string, pathname: string) {
  return new URL(url).pathname === `/api/v1${pathname}`;
}

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

    const summaryResponsePromise = page.waitForResponse(
      (response) => isApiPath(response.url(), '/manager/team-summary'),
    );
    await page.reload();
    const summaryResponse = await summaryResponsePromise;
    expect(summaryResponse.status()).toBe(200);
    const summary = await summaryResponse.json() as {
      membersCount: number;
      completionRate: number;
      dueThisWeekCount: number;
      overdueCount: number;
      avgTeamScore: number | null;
      members: Array<{ status: string; completionPercent: number }>;
    };

    // Seed: learner has completed lesson 1 of 3 published lessons, no due date on the assignment, no attempts yet.
    expect(summary).toMatchObject({
      membersCount: 1,
      completionRate: 33,
      dueThisWeekCount: 0,
      overdueCount: 0,
      avgTeamScore: null,
      members: [{ status: 'risk', completionPercent: 33 }],
    });

    await expect(page.getByRole('heading', { name: 'Панель менеджера' })).toBeVisible();
    await expect(page.getByText('Сотрудников').locator('..').getByText('1', { exact: true })).toBeVisible();
    await expect(page.getByText('Завершение').locator('..').getByText('33%', { exact: true })).toBeVisible();
    await expect(page.getByText('Срок на неделе').locator('..').getByText('0', { exact: true })).toBeVisible();
    await expect(page.getByText('Требует внимания').locator('..').getByText('0', { exact: true })).toBeVisible();

    await attachScreenshot(page, testInfo, 'manager-dashboard-desktop');
  });

  test('shows only the managed team, denies an out-of-team user, and attaches a mobile screenshot', async ({ page }, testInfo) => {
    await loginAsManager(page);
    await page.setViewportSize({ width: 375, height: 812 });

    const summaryResponsePromise = page.waitForResponse(
      (response) => isApiPath(response.url(), '/manager/team-summary'),
    );
    await page.goto('/manager/team');
    const summaryResponse = await summaryResponsePromise;
    expect(summaryResponse.status()).toBe(200);
    const summary = await summaryResponse.json() as {
      membersCount: number;
      members: Array<{ email: string }>;
    };

    expect(summary).toEqual(expect.objectContaining({
      membersCount: 1,
      members: [expect.objectContaining({ email: 'learner@demo.com' })],
    }));
    await expect(page.getByRole('heading', { name: 'Команда' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Alex Learner' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'admin@demo.com' })).toHaveCount(0);

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
    await page.route('**/api/v1/manager/team-summary', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 750));
      await route.continue();
    });

    await page.goto('/manager/dashboard');
    await expect(page.getByRole('status')).toHaveText('Загрузка панели менеджера...');
    await expect(page.getByRole('heading', { name: 'Панель менеджера' })).toBeVisible();

    await page.unroute('**/api/v1/manager/team-summary');
    await page.route('**/api/v1/manager/team-summary', async (route) => {
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
    const emptySummary = JSON.stringify({
      membersCount: 0,
      completionRate: 0,
      dueThisWeekCount: 0,
      overdueCount: 0,
      avgTeamScore: null,
      upcomingDeadlines: [],
      members: [],
    });
    await page.route('**/api/v1/manager/team-summary', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: emptySummary });
    });

    await page.goto('/manager/team');
    await expect(page.getByText('Сотрудники не найдены.')).toBeVisible();
  });
});
