import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { AxeBuilder } from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';

import { expect, test } from '../fixtures/isolated-test.js';

const organization = 'demo-company';
const password = 'Demo1234!';

type DemoRole = 'admin' | 'manager' | 'instructor' | 'mentor' | 'learner';

async function loginAs(page: Page, role: DemoRole) {
  await page.goto('/login');
  await page.locator('input[name="organizationId"]').fill(organization);
  await page.locator('input[name="email"]').fill(`${role}@demo.com`);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
}

const severityOrder = ['critical', 'serious', 'moderate', 'minor', 'unknown'] as const;

async function auditAccessibility(page: Page, testInfo: TestInfo) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const findings = Object.fromEntries(severityOrder.map((severity) => [
    severity,
    results.violations.filter(({ impact }) => (impact ?? 'unknown') === severity),
  ]));
  const report = {
    url: page.url(),
    counts: Object.fromEntries(severityOrder.map((severity) => [severity, findings[severity].length])),
    findings,
  };
  const reportBody = JSON.stringify(report, null, 2);
  const reportPath = testInfo.outputPath('accessibility-reports', 'axe-findings.json');
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, reportBody);
  await testInfo.attach('axe-findings-by-severity', { body: reportBody, contentType: 'application/json' });

  console.log(`[axe] ${page.url()} ${severityOrder.map((severity) => `${severity}=${findings[severity].length}`).join(' ')}`);

  // Moderate findings have a zero baseline. Critical, serious, and moderate
  // violations therefore block CI; minor findings remain visible in the report.
  const blocking = results.violations.filter(({ impact }) =>
    impact === 'critical' || impact === 'serious' || impact === 'moderate');

  expect(blocking, blocking.map(({ id, impact, help, nodes }) =>
    `${impact}: ${id} — ${help}\n${nodes.map(({ target }) => `  ${target.join(' ')}`).join('\n')}`,
  ).join('\n')).toEqual([]);
}

test.describe('WCAG AA browser baseline', () => {
  for (const path of ['/', '/login']) {
    test(`${path} has no blocking axe violations`, async ({ page }, testInfo) => {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await auditAccessibility(page, testInfo);
    });
  }

  const workspaces: Array<{ role: DemoRole; destination: string }> = [
    { role: 'admin', destination: '/admin' },
    { role: 'manager', destination: '/manager/dashboard' },
    { role: 'instructor', destination: '/instructor/dashboard' },
    { role: 'mentor', destination: '/mentor' },
    { role: 'learner', destination: '/learn' },
  ];

  for (const { role, destination } of workspaces) {
    test(`${role} workspace has an accessible rendered state`, async ({ page }, testInfo) => {
      await loginAs(page, role);
      await expect(page).toHaveURL(new RegExp(`${destination.replaceAll('/', '\\/')}$`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await auditAccessibility(page, testInfo);
    });
  }

  test('login remains accessible at 320px and 200% browser zoom', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 812 });
    await page.goto('/login');
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await expect(page.locator('main')).toBeVisible();
    await auditAccessibility(page, testInfo);
  });
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
