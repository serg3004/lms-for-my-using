import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { freshReportState, installReportMocks } from '../fixtures/checklist-instance-report.js';

// PR 578: in the high-contrast theme the main screens of every kind of user pass the enhanced (AAA) contrast rule.
async function openContrast(page: Page, roles: string[], path: string) {
  await page.addInitScript(() => { localStorage.setItem('lms.themeMode', 'contrast'); });
  await page.route('**/api/v1/**', async (route) => {
    const apiPath = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (apiPath === '/auth/me') return route.fulfill({ json: { id: 'u1', organizationId: 'org', email: 'user@example.invalid', firstName: 'Ada', lastName: 'Admin', roles, status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (apiPath.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (apiPath === '/checklists' || apiPath === '/checklist-scales') return route.fulfill({ json: [] });
    if (apiPath === '/checklist-folders') return route.fulfill({ json: { folders: [], rootChecklistCount: 0, checklistCount: 0 } });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
  await page.waitForLoadState('networkidle');
}

async function expectEnhancedContrast(page: Page) {
  const result = await new AxeBuilder({ page }).withRules(['color-contrast-enhanced']).analyze();
  expect(result.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target.join(' ')).slice(0, 5) }))).toEqual([]);
}

test('login page keeps AAA contrast in the high-contrast theme', async ({ page }) => {
  await openContrast(page, [], '/login');
  await expectEnhancedContrast(page);
});

test('administrator screen (checklists) keeps AAA contrast in the high-contrast theme', async ({ page }) => {
  await openContrast(page, ['admin'], '/admin/checklists');
  await expect(page.getByRole('heading', { name: 'Чек-листы' }).first()).toBeVisible();
  await expectEnhancedContrast(page);
});

test('learner screen keeps AAA contrast in the high-contrast theme', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('lms.themeMode', 'contrast'); });
  await installReportMocks(page, freshReportState('in_progress'));
  await page.goto('/learn/checklists');
  await expect(page.getByText('Приёмка товара')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
  await expectEnhancedContrast(page);
});
