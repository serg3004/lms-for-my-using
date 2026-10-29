import { openPreviewBuilder, openSheetPreview } from '../fixtures/checklist-preview.js';
import { previewSessionImportPage } from '../fixtures/session-employee-import.js';
import { managementCriterion, openManagementEdit, openManagementList, openManagementReport, openManagementWizard } from '../fixtures/session-management.js';
import { openCriterionScalePage } from '../fixtures/criterion-scales.js';
import { installManagerReportMocks } from '../fixtures/checklist-manager-report.js';
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

async function auditAccessibility(page: Page, testInfo: TestInfo, name = 'axe-findings', include?: string) {
  const builder = new AxeBuilder({ page });
  if (include) builder.include(include);
  const results = await builder
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
  const reportPath = testInfo.outputPath('accessibility-reports', `${name}.json`);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, reportBody);
  await testInfo.attach(`${name}-by-severity`, { body: reportBody, contentType: 'application/json' });

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
  for (const width of [375, 1440]) {
    test(`observer sheet preview is accessible at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await openPreviewBuilder(page);
      const dialog = await openSheetPreview(page);
      await expect(dialog.locator(':focus')).toHaveCount(1);
      await auditAccessibility(page, testInfo, 'observer-sheet-preview', 'dialog.admin-preview-overlay');
    });
  }
  test.describe('session management role shells (PR 360б)', () => {
    test.use({ timezoneId: 'UTC' });
    for (const role of ['instructor', 'mentor'] as const) {
      for (const width of [375, 1440]) {
        test(`${role} management list, dialogs and report are accessible at ${width}px`, async ({ page }, testInfo) => {
          test.setTimeout(60_000);
          await page.setViewportSize({ width, height: 900 });
          await openManagementList(page, role);
          await auditAccessibility(page, testInfo, 'management-list');

          const edit = await openManagementEdit(page);
          await auditAccessibility(page, testInfo, 'management-edit');
          await page.keyboard.press('Escape');
          await expect(edit).not.toBeVisible();

          const wizard = await openManagementWizard(page);
          await auditAccessibility(page, testInfo, 'management-create');
          await page.keyboard.press('Escape');
          await expect(wizard).not.toBeVisible();
          await expect(page.getByRole('button', { name: /Новая сессия/ })).toBeFocused();

          await openManagementReport(page, role);
          await auditAccessibility(page, testInfo, 'management-report-summary');
          for (const [tab, report] of [['Участники', 'participants'], ['Критерии', 'criteria'], ['История', 'history']]) {
            const button = page.getByRole('tab', { name: tab, exact: true });
            await button.focus();
            await page.keyboard.press('Enter');
            await expect(button).toHaveAttribute('aria-selected', 'true');
            if (report === 'criteria') await expect(page.getByText(managementCriterion, { exact: true })).toBeVisible();
            await auditAccessibility(page, testInfo, `management-report-${report}`);
          }
        });
      }
    }
  });

  for (const path of ['/', '/login']) {
    test(`${path} has no blocking axe violations`, async ({ page }, testInfo) => {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await auditAccessibility(page, testInfo);
    });
  }

  for (const role of ['learner', 'instructor'] as const) {
    test(`${role} criterion-scale answers are accessible`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 375, height: 900 });
      await openCriterionScalePage(page, role);
      await page.getByRole('button', { name: /\bNo\b/ }).click();
      await expect(page.getByRole('button', { name: /\bNo\b/ })).toHaveAttribute('aria-pressed', 'true');
      await auditAccessibility(page, testInfo);
    });
  }

  for (const role of ['admin', 'manager', 'instructor', 'mentor'] as const) {
    test(`${role} employee session import preview is accessible`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 375, height: 900 });
      await previewSessionImportPage(page, role);
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

  test('admin department tree page has an accessible rendered state', async ({ page }, testInfo) => {
    // This test does more round trips than the read-only workspace checks above (two extra
    // GETs on load, then a write to create a department before auditing) -- give it headroom
    // beyond the 30s default so CI load doesn't turn real latency into a false failure.
    test.setTimeout(60_000);
    await loginAs(page, 'admin');
    // loginAs() only submits the form; it does not wait for the post-login redirect (unlike
    // the workspace tests above, which assert the destination URL right after calling it). Without
    // this wait, goto() below can race the in-flight login and land back on /login.
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/admin/departments');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // The demo org has no seeded departments, so create one first -- axe should cover the
    // populated tree's role="tree"/"treeitem" ARIA semantics, not just the empty-state shell.
    await page.getByRole('button', { name: /Добавить корневое подразделение/ }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Добавить корневое подразделение' });
    await dialog.getByLabel('Название').fill(`A11y department ${Date.now()}`);
    await dialog.getByRole('button', { name: 'Создать' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('tree')).toBeVisible();

    await auditAccessibility(page, testInfo);
  });

  test('admin checklist sessions list and new-session wizard have an accessible rendered state', async ({ page }, testInfo) => {
    await loginAs(page, 'admin');
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/admin/checklists/sessions');
    await expect(page.getByRole('heading', { name: 'Сессии' })).toBeVisible();
    await auditAccessibility(page, testInfo);

    await page.getByRole('button', { name: /Новая сессия/ }).click();
    await expect(page.getByRole('heading', { name: 'Новая сессия' })).toBeVisible();
    await auditAccessibility(page, testInfo);
  });

  test('observer eligibility settings are accessible in role and people modes', async ({ page }, testInfo) => {
    await loginAs(page, 'admin');
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/admin/checklists/sessions');
    await page.getByRole('button', { name: /Настройки/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Кто может быть наблюдателем')).toBeVisible();
    await auditAccessibility(page, testInfo);
    await dialog.getByLabel('Выбор наблюдателей').selectOption('selected_users');
    await expect(dialog.getByText('Загрузка пользователей…')).not.toBeVisible();
    await auditAccessibility(page, testInfo);
  });

  test('instructor "Conduct" (mobile observer) sessions list has an accessible rendered state', async ({ page }, testInfo) => {
    // Mobile-first screen (PR 297 ADR_CHECKLIST_SESSION_OVERLAY.md) -- audit it at the phone
    // viewport it's actually designed for, not the default desktop one every other test above uses.
    // PR 319: this moved from a tab embedded in the review-queue page to its own route.
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAs(page, 'instructor');
    await expect(page).toHaveURL(/\/instructor\/dashboard$/);
    await page.goto('/instructor/checklists/sessions');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await auditAccessibility(page, testInfo);
  });

  test('learner checklists page (with the "My training sessions" section) has an accessible rendered state', async ({ page }, testInfo) => {
    await loginAs(page, 'learner');
    await expect(page).toHaveURL(/\/learn$/);
    await page.goto('/learn/checklists');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await auditAccessibility(page, testInfo);
  });

  test('learner free-access checklist catalog has an accessible rendered state', async ({ page }, testInfo) => {
    await loginAs(page, 'learner');
    await expect(page).toHaveURL(/\/learn$/);
    await page.route('**/api/v1/checklists/free', (route) => route.fulfill({
      json: [
        { id: 'free-1', title: 'Открытие смены', description: 'Проверьте зал до прихода гостей.', itemCount: 12, pinned: true, coverUpdatedAt: '2026-10-27T10:00:00.000Z', activeInstanceId: null, activeInstanceStatus: null },
        { id: 'free-2', title: 'Закрытие смены', description: null, itemCount: 7, pinned: false, activeInstanceId: 'instance-2', activeInstanceStatus: 'in_progress' },
      ],
    }));
    // PR 355: the tile picture needs alternative text; the second tile uses the default illustration.
    const cover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#bfdbfe"/></svg>')}`;
    await page.route('**/api/v1/checklists/free-1/cover', (route) => route.fulfill({ json: { url: cover, expiresIn: 300 } }));
    await page.goto('/learn/checklists');
    await expect(page.getByRole('heading', { name: 'Закреплённые листы' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Открытие смены/ })).toHaveCount(2);
    await expect(page.getByRole('heading', { name: 'Все мои листы' })).toBeVisible();
    await auditAccessibility(page, testInfo);
  });

  for (const role of ['learner', 'manager'] as const) {
    test(`${role} assigned-observer block is accessible`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await loginAs(page, role);
      await expect(page).toHaveURL(role === 'learner' ? /\/learn$/ : /\/manager\/dashboard$/);
      await page.route('**/api/v1/checklist-sessions/to-conduct?**', (route) => route.fulfill({ json: {
        items: [{ id: 'assigned-a11y', status: 'in_progress', checklist: { title: 'Observed checklist' }, learner: { firstName: 'Employee', lastName: 'One' }, scheduledAt: null }],
        total: 1, page: 1, pageSize: 100,
      } }));
      await page.goto(role === 'learner' ? '/learn/checklists' : '/manager/team');
      await expect(page.getByRole('region', { name: 'Сессии к проведению' })).toBeVisible();
      await auditAccessibility(page, testInfo);
    });
  }

  test('manager checklist analytics dashboard has an accessible rendered state', async ({ page }, testInfo) => {
    await loginAs(page, 'manager');
    await expect(page).toHaveURL(/\/manager\/dashboard$/);
    await page.goto('/manager/checklists');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await auditAccessibility(page, testInfo);
  });

  for (const role of ['admin', 'manager'] as const) {
    test(`${role} manager breakdown and unassigned filter are accessible`, async ({ page }, testInfo) => {
      await installManagerReportMocks(page, role);
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(role === 'admin' ? '/admin/checklists/analytics' : '/manager/checklists');
      const section = page.locator('section[aria-labelledby="manager-checklists-managers"]');
      await expect(section.getByText('=Alice Manager', { exact: true })).toBeVisible();
      await auditAccessibility(page, testInfo);
      await page.getByLabel('Руководитель', { exact: true }).selectOption('unassigned');
      await expect(section.getByText('—', { exact: true })).toBeVisible();
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
