import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/isolated-test.js';

const organization = 'demo-company';
const password = 'Demo1234!';

async function loginAs(page: Page, role: 'learner' | 'manager') {
  await page.goto('/login');
  await page.locator('input[name="organizationId"]').fill(organization);
  await page.locator('input[name="email"]').fill(`${role}@demo.com`);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(role === 'learner' ? /\/learn$/ : /\/manager\/dashboard$/);
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
  test('learner dashboard: empty state, HTTP error states, offline recovery, transport timeout', async ({ page }) => {
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
      await page.route('**/api/v1/learner-dashboard', (route) => route.abort('timedout'));

      await page.reload();
      await expect(page.getByRole('alert')).toContainText('Unable to load learner profile. Try again later.');
      expect(pageErrors).toEqual([]);
      await page.unroute('**/api/v1/learner-dashboard');
    });
  });

  test('manager assignment accepts only one rapid duplicate submit', async ({ page }) => {
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
