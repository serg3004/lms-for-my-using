import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const checklist = {
  id: 'checklist-1', organizationId: 'org', title: 'Opening shift checklist', description: null, status: 'draft', scoringMode: 'sum_points',
  passThreshold: 80, scaleLevels: null, requiresReview: false, createdBy: 'admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  items: [{ id: 'item-1', checklistId: 'checklist-1', order: 1, text: 'Turn on the lights', points: 10, isRequired: true, photoRequired: false }],
};

async function openScaleEditor(page: Page) {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Ada', lastName: 'Admin', roles: ['admin'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklists') return route.fulfill({ json: [checklist] });
    if (path === '/checklist-scales' || path.endsWith('/groups')) return route.fulfill({ json: [] });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.goto('/admin/checklists');
  if (page.viewportSize()!.width <= 860) await page.getByRole('button', { name: /Opening shift checklist$/ }).click();
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await page.getByRole('button', { name: 'Оценочные шкалы' }).click();
  await page.getByRole('button', { name: 'Новая шкала' }).click();
  await expect(page.getByRole('dialog', { name: 'Новая шкала' }).getByLabel('Название уровня 1')).toBeVisible();
}

test.describe('Evaluation scale level editor accessibility (PR 343)', () => {
  for (const width of [320, 375, 768]) {
    test(`has no blocking axe violations and no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openScaleEditor(page);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations.filter(({ impact }) => ['critical', 'serious', 'moderate'].includes(impact ?? ''))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }

  test('level fields are reachable by keyboard in reading order', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await openScaleEditor(page);
    const dialog = page.getByRole('dialog', { name: 'Новая шкала' });
    await dialog.getByLabel('Название уровня 1').focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('Баллы уровня 1')).toBeFocused();
  });
});
