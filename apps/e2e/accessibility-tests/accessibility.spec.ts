import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/isolated-test.js';

const organization = 'demo-company';
const password = 'Demo1234!';

type DemoRole = 'admin' | 'manager' | 'instructor' | 'learner';

async function loginAs(page: Page, role: DemoRole) {
  await page.goto('/login');
  await page.locator('input[name="organizationId"]').fill(organization);
  await page.locator('input[name="email"]').fill(`${role}@demo.com`);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
}

async function expectNoHighImpactViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const violations = results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');

  expect(violations, violations.map(({ id, impact, help, nodes }) =>
    `${impact}: ${id} — ${help}\n${nodes.map(({ target }) => `  ${target.join(' ')}`).join('\n')}`,
  ).join('\n')).toEqual([]);
}

test.describe('WCAG AA browser baseline', () => {
  for (const path of ['/', '/login']) {
    test(`${path} has no serious or critical axe violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await expectNoHighImpactViolations(page);
    });
  }

  const workspaces: Array<{ role: DemoRole; destination: string }> = [
    { role: 'admin', destination: '/admin' },
    { role: 'manager', destination: '/manager/dashboard' },
    { role: 'instructor', destination: '/instructor/dashboard' },
    { role: 'learner', destination: '/learn' },
  ];

  for (const { role, destination } of workspaces) {
    test(`${role} workspace has an accessible rendered state`, async ({ page }) => {
      await loginAs(page, role);
      await expect(page).toHaveURL(new RegExp(`${destination.replaceAll('/', '\\/')}$`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHighImpactViolations(page);
    });
  }
});

test.describe('keyboard and focus baseline', () => {
  test('skip link moves keyboard focus to the main landmark', async ({ page }) => {
    await page.goto('/login');
    const skipLink = page.getByRole('link', { name: 'Перейти к основному содержимому' });
    await expect(skipLink).toBeVisible();

    // Start tabbing only after React has rendered the route. Pressing Tab while
    // the document shell is still empty can advance focus before the skip link
    // exists, which makes this assertion depend on application startup timing.
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();
    await skipLink.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('language menu and login form are operable without a pointer', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'RU' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).not.toBeVisible();

    await page.locator('input[name="organizationId"]').focus();
    await page.keyboard.type(organization);
    await page.keyboard.press('Tab');
    await page.keyboard.type('learner@demo.com');
    await page.keyboard.press('Tab');
    await page.keyboard.type(password);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/learn$/);
  });

  test('mobile navigation receives focus and returns it after Escape', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAs(page, 'admin');
    const openButton = page.getByRole('button', { name: 'Открыть навигацию' });
    await openButton.click();
    await expect(page.getByRole('button', { name: 'Закрыть навигацию' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(openButton).toBeFocused();
  });
});
