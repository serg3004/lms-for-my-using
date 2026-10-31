import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// PR 397: the module-settings block in the checklist editor ("As in the organization" per group).
const checklist = {
  id: 'checklist-1', organizationId: 'org', title: 'Opening shift checklist', description: null, status: 'draft', scoringMode: 'sum_points',
  passThreshold: 80, scaleLevels: null, requiresReview: false, createdBy: 'admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  items: [{ id: 'item-1', checklistId: 'checklist-1', order: 1, text: 'Turn on the lights', points: 10, isRequired: true, photoRequired: false }],
  moduleSettings: { thresholds: null, resultColors: null, feedbackVisibility: null, observers: null, defaultLocationCapturePolicy: null }, hasModuleOverrides: false,
};
const orgSettings = {
  organizationId: 'org', moduleEnabled: true, highPerformanceThreshold: 80, lowThreshold: 40, resultColors: { low: '#C62828', mid: '#F9A825', high: '#2E7D32' },
  defaultGeolocationPolicy: 'optional', feedbackVisibility: 'after_completion', observerEligibility: 'selected_roles', observerRoles: ['admin'], observerUserIds: [], updatedAt: null,
};

async function openEditor(page: Page, saved: Array<Record<string, unknown>>) {
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Ada', lastName: 'Admin', roles: ['admin'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklists/workplace-settings') return route.fulfill({ json: orgSettings });
    if (path === '/checklists/checklist-1' && request.method() === 'PATCH') { saved.push(request.postDataJSON()); return route.fulfill({ json: checklist }); }
    if (path === '/checklists') return route.fulfill({ json: [checklist] });
    if (path === '/checklist-scales' || path.endsWith('/groups')) return route.fulfill({ json: [] });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.goto('/admin/checklists');
  if (page.viewportSize()!.width <= 860) await page.getByRole('button', { name: /Opening shift checklist$/ }).click();
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await page.getByText('Настройки модуля для этого листа').click();
}

test.describe('Checklist module settings block (PR 397)', () => {
  test('a group is switched off "as in the organization", pre-filled from it, and saved with the checklist', async ({ page }) => {
    const saved: Array<Record<string, unknown>> = [];
    await openEditor(page, saved);
    await expect(page.locator('.admin-help__tip').filter({ hasText: 'Сейчас в организации: 80% / 40%' })).toBeAttached();
    const thresholds = page.getByRole('checkbox', { name: 'Пороги результата: как в организации' });
    await thresholds.uncheck();
    await expect(page.getByLabel('Порог высокого выполнения')).toHaveValue('80');
    await page.getByRole('button', { name: 'Сбросить всё: как в организации' }).click();
    await expect(thresholds).toBeChecked();
    await thresholds.uncheck();
    await page.getByLabel('Порог высокого выполнения').fill('70');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0]!['moduleSettings']).toEqual({ thresholds: { high: 70, low: 40 }, resultColors: null, feedbackVisibility: null, observers: null });
  });

  for (const width of [375, 1280]) {
    test(`has no blocking axe violations and no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openEditor(page, []);
      await page.getByRole('checkbox', { name: 'Цвета результата: как в организации' }).uncheck();
      const result = await new AxeBuilder({ page }).include('[data-testid="checklist-module-settings"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations.filter(({ impact }) => ['critical', 'serious', 'moderate'].includes(impact ?? ''))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }
});
