import { expect, test, type Page } from '@playwright/test';

import { freshReportState, installReportMocks } from '../fixtures/checklist-instance-report.js';

// PR 578: the main screens in the high-contrast theme (login, administrator, learner) as pixel baselines.
const checklist = {
  id: 'c1', organizationId: 'org', title: 'Открытие смены', description: null, status: 'published', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false,
  createdBy: 'admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', items: [], itemGroups: [], contextFields: null, folderId: null,
  moduleSettings: { thresholds: null, resultColors: null, feedbackVisibility: null, observers: null, defaultLocationCapturePolicy: null }, hasModuleOverrides: false,
};

async function openContrast(page: Page, roles: string[], path: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => { localStorage.setItem('lms.themeMode', 'contrast'); });
  await page.route('**/api/v1/**', async (route) => {
    const apiPath = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (apiPath === '/auth/me') return route.fulfill({ json: { id: 'u1', organizationId: 'org', email: 'user@example.invalid', firstName: 'Ada', lastName: 'Admin', roles, status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (apiPath.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (apiPath === '/checklists') return route.fulfill({ json: [checklist] });
    if (apiPath === '/checklist-scales') return route.fulfill({ json: [] });
    if (apiPath === '/checklist-folders') return route.fulfill({ json: { folders: [], rootChecklistCount: 1, checklistCount: 1 } });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
}

for (const width of [390, 1280]) {
  test(`login in the high-contrast theme at ${width}px`, async ({ page }) => {
    await openContrast(page, [], '/login', width);
    await expect(page).toHaveScreenshot(`contrast-login-${width}.png`, { fullPage: true, maxDiffPixels: 3000 });
  });

  test(`administrator checklists in the high-contrast theme at ${width}px`, async ({ page }) => {
    await openContrast(page, ['admin'], '/admin/checklists', width);
    await expect(page.getByText('Открытие смены').first()).toBeVisible();
    await expect(page).toHaveScreenshot(`contrast-admin-checklists-${width}.png`, { fullPage: true, maxDiffPixels: 3000 });
  });

  test(`learner checklists in the high-contrast theme at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => { localStorage.setItem('lms.themeMode', 'contrast'); });
    await installReportMocks(page, freshReportState('in_progress'));
    await page.goto('/learn/checklists');
    await expect(page.getByText('Приёмка товара')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot(`contrast-learner-checklists-${width}.png`, { fullPage: true, maxDiffPixels: 3000 });
  });
}
