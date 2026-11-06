import { expect, test, type Page } from '@playwright/test';

// PR 401: the "General information" block of the checklist editor keeps its fields at full width.
const fields = [
  { id: 'f1', label: 'Смена', type: 'text', required: true, order: 1 },
  { id: 'f2', label: 'Дата проверки', type: 'date', required: false, order: 2 },
];
const base = {
  id: 'checklist-1', organizationId: 'org', title: 'Opening shift checklist', description: null, status: 'draft', scoringMode: 'sum_points',
  passThreshold: 80, scaleLevels: null, requiresReview: false, createdBy: 'admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  items: [{ id: 'item-1', checklistId: 'checklist-1', order: 1, text: 'Turn on the lights', points: 10, isRequired: true, photoRequired: false }],
  moduleSettings: { thresholds: null, resultColors: null, feedbackVisibility: null, observers: null, defaultLocationCapturePolicy: null }, hasModuleOverrides: false,
};

async function openEditor(page: Page, contextFields: unknown[] | null, saved: Array<Record<string, unknown>>) {
  const checklist = { ...base, contextFields };
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Ada', lastName: 'Admin', roles: ['admin'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklists/checklist-1' && request.method() === 'PATCH') { saved.push(request.postDataJSON()); return route.fulfill({ json: checklist }); }
    if (path === '/checklists') return route.fulfill({ json: [checklist] });
    if (path === '/checklist-scales' || path.endsWith('/groups')) return route.fulfill({ json: [] });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.goto('/admin/checklists');
  if (page.viewportSize()!.width <= 860) await page.getByRole('button', { name: /Opening shift checklist$/ }).click();
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await expect(page.getByRole('heading', { name: /Общая информация/ })).toBeVisible();
}

test.describe('Checklist editor: General information block (PR 401)', () => {
  for (const width of [360, 768, 1280]) {
    test(`fields fill the card, line up and stay inside it at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openEditor(page, fields, []);
      const rows = await page.locator('.admin-context-field-row').evaluateAll((nodes) => nodes.map((row) => {
        const box = (selector: string) => (row.querySelector(selector) as HTMLElement).getBoundingClientRect();
        const parent = (row.parentElement as HTMLElement).getBoundingClientRect();
        const name = box('[role="textbox"]');
        const type = box('select');
        const required = box('.admin-context-field-row__required');
        const menu = box('.admin-context-field-row__menu');
        return { parentLeft: parent.left, parentRight: parent.right, name: { left: name.left, right: name.right, width: name.width, height: name.height }, type: { width: type.width, height: type.height, top: type.top }, requiredHeight: required.height, menuRight: menu.right, menuHeight: menu.height, requiredBottom: required.bottom, typeBottom: type.bottom };
      }));
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        // The name field is no longer squeezed: at least 220 px (or the whole card when it is narrower).
        expect(row.name.width).toBeGreaterThanOrEqual(Math.min(220, row.parentRight - row.parentLeft - 1));
        expect(row.name.left).toBeGreaterThanOrEqual(row.parentLeft - 1);
        expect(row.menuRight).toBeLessThanOrEqual(row.parentRight + 1);
        // One control height, and "Required" sits on the line of the fields.
        expect(Math.abs(row.name.height - row.type.height)).toBeLessThanOrEqual(1);
        // "Required" shares the bottom line of the fields while the row fits on one line; otherwise it wraps below.
        expect(row.requiredBottom).toBeGreaterThanOrEqual(row.typeBottom - 2);
        // A narrow card (the editor sits next to the list even at 1280): the name takes the whole line.
        if (row.parentRight - row.parentLeft <= 640) expect(row.name.width).toBeGreaterThan((row.parentRight - row.parentLeft) * 0.9);
        if (width <= 860) {
          expect(row.type.height).toBeGreaterThanOrEqual(44);
          expect(row.menuHeight).toBeGreaterThanOrEqual(44);
        }
        expect(row.type.width).toBeGreaterThanOrEqual(140);
        expect(row.type.width).toBeLessThanOrEqual(row.parentRight - row.parentLeft);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }

  test('an empty block shows no input row; a field is added, renamed and deleted', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const saved: Array<Record<string, unknown>> = [];
    await openEditor(page, null, saved);
    await expect(page.locator('.admin-context-field-row')).toHaveCount(0);
    await expect(page.getByText('Заполняется наблюдателем перед критериями.')).toBeVisible();

    await page.getByRole('button', { name: '+ Поле' }).click();
    const row = page.locator('.admin-context-field-row');
    await expect(row).toHaveCount(1);
    await row.getByLabel('Название поля').fill('Магазин');
    await row.getByLabel('Название поля').blur();
    await expect.poll(() => saved.some((body) => JSON.stringify(body.contextFields ?? []).includes('Магазин'))).toBe(true);

    await row.getByRole('button', { name: /Действия с полем/ }).click();
    await page.getByRole('menuitem', { name: 'Удалить' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click();
    await expect(page.locator('.admin-context-field-row')).toHaveCount(0);
    await expect.poll(() => saved.some((body) => body.contextFields === null)).toBe(true);
  });
});
