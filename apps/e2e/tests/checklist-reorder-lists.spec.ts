import { expect, test, type Page } from '@playwright/test';
import { openSettingsTab } from '../fixtures/checklist-settings-tab.js';

// PR 418: "General information" fields and the scale levels of a checklist can be reordered (arrows, mouse drag, keyboard);
// the order of the fields is saved at once, a failed save brings the old order back.
const fields = [
  { id: 'f1', label: 'Смена', type: 'text', required: true, order: 0 },
  { id: 'f2', label: 'Дата проверки', type: 'date', required: false, order: 1 },
  { id: 'f3', label: 'Магазин', type: 'text', required: false, order: 2 },
];
const levels = [
  { level: 1, label: 'Плохо', points: 0 },
  { level: 2, label: 'Нормально', points: 50 },
  { level: 3, label: 'Отлично', points: 100 },
];
const base = {
  id: 'checklist-1', organizationId: 'org', title: 'Opening shift checklist', description: null, status: 'draft', scoringMode: 'sum_points',
  passThreshold: 80, scaleLevels: null, requiresReview: false, createdBy: 'admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  items: [{ id: 'item-1', checklistId: 'checklist-1', order: 1, text: 'Turn on the lights', points: 10, isRequired: true, photoRequired: false }],
  moduleSettings: { thresholds: null, resultColors: null, feedbackVisibility: null, observers: null, defaultLocationCapturePolicy: null }, hasModuleOverrides: false,
};

async function openEditor(page: Page, overrides: Record<string, unknown>, saved: Array<Record<string, unknown>>, failSave = { value: false }) {
  const checklist = { ...base, ...overrides };
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Ada', lastName: 'Admin', roles: ['admin'], status: 'active' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklists/checklist-1' && request.method() === 'PATCH') {
      saved.push(request.postDataJSON());
      return failSave.value ? route.fulfill({ status: 500, json: { message: 'boom' } }) : route.fulfill({ json: checklist });
    }
    if (path === '/checklists') return route.fulfill({ json: [checklist] });
    if (path === '/checklist-scales' || path.endsWith('/groups')) return route.fulfill({ json: [] });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.goto('/admin/checklists');
  if (page.viewportSize()!.width <= 860) await page.getByRole('button', { name: /Opening shift checklist$/ }).click();
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await expect(page.getByRole('heading', { name: /Общая информация/ })).toBeVisible();
}

const labels = (page: Page) => page.locator('.admin-context-field-row [role="textbox"]').evaluateAll((nodes) => nodes.map((node) => node.textContent));
const savedLabels = (body: Record<string, unknown>) => ((body.contextFields ?? []) as Array<{ label: string; order: number }>).map((field) => `${field.order}:${field.label}`);

test.describe('Checklist editor: reorder (PR 418)', () => {
  test('arrows move a field of "General information" and the new order is saved', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const saved: Array<Record<string, unknown>> = [];
    await openEditor(page, { contextFields: fields }, saved);
    await expect.poll(() => labels(page)).toEqual(['Смена', 'Дата проверки', 'Магазин']);
    // the first field has no "up", the last has no "down"
    await expect(page.getByRole('button', { name: 'Переместить вверх: Смена' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Переместить вниз: Магазин' })).toBeDisabled();

    await page.getByRole('button', { name: 'Переместить вниз: Смена' }).click();
    await expect.poll(() => labels(page)).toEqual(['Дата проверки', 'Смена', 'Магазин']);
    await expect.poll(() => saved.map(savedLabels).at(-1)).toEqual(['0:Дата проверки', '1:Смена', '2:Магазин']);

    await page.getByRole('button', { name: 'Переместить вверх: Магазин' }).click();
    await expect.poll(() => labels(page)).toEqual(['Дата проверки', 'Магазин', 'Смена']);
    await expect.poll(() => saved.map(savedLabels).at(-1)).toEqual(['0:Дата проверки', '1:Магазин', '2:Смена']);
  });

  test('the row menu moves a field too', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const saved: Array<Record<string, unknown>> = [];
    await openEditor(page, { contextFields: fields }, saved);
    await page.locator('.admin-context-field-row').nth(1).getByRole('button', { name: /Действия с полем/ }).click();
    await page.getByRole('menuitem', { name: 'Переместить вверх' }).click();
    await expect.poll(() => labels(page)).toEqual(['Дата проверки', 'Смена', 'Магазин']);
  });

  test('a field is dragged by its handle with the mouse', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const saved: Array<Record<string, unknown>> = [];
    await openEditor(page, { contextFields: fields }, saved);
    const handle = page.getByRole('button', { name: 'Перетащить поле: Смена' });
    const target = page.locator('.admin-context-field-row').nth(2);
    await target.scrollIntoViewIfNeeded();
    await handle.scrollIntoViewIfNeeded();
    const from = (await handle.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 6, from.y + from.height / 2 + 6, { steps: 4 });
    await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, { steps: 20 });
    await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2 + 1, { steps: 3 });
    await page.mouse.up();
    await expect.poll(() => labels(page)).toEqual(['Дата проверки', 'Магазин', 'Смена']);
    await expect.poll(() => saved.map(savedLabels).at(-1)).toEqual(['0:Дата проверки', '1:Магазин', '2:Смена']);
  });

  test('the keyboard moves a field down by its handle', async ({ page }) => {
    // tall viewport: the keyboard sensor of dnd-kit picks the next row by its position on the screen
    await page.setViewportSize({ width: 1280, height: 2000 });
    await openEditor(page, { contextFields: fields }, []);
    await page.evaluate(() => document.fonts.ready);
    const handle = page.getByRole('button', { name: 'Перетащить поле: Смена' });
    await handle.focus();
    await page.keyboard.press('Space');
    await expect(handle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[id^="DndLiveRegion"]').filter({ hasText: '«Смена» над «Смена».' })).toHaveCount(1);
    // The start announcement precedes dnd-kit's layout measurement; let its next render finish before moving.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[id^="DndLiveRegion"]').filter({ hasText: '«Смена» над «Дата проверки».' })).toHaveCount(1);
    await page.keyboard.press('Space');
    await expect.poll(() => labels(page)).toEqual(['Дата проверки', 'Смена', 'Магазин']);
  });

  test('a failed save brings the old order back and says so', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const failSave = { value: true };
    await openEditor(page, { contextFields: fields }, [], failSave);
    await page.getByRole('button', { name: 'Переместить вниз: Смена' }).click();
    await expect.poll(() => labels(page)).toEqual(['Смена', 'Дата проверки', 'Магазин']);
    await expect(page.getByText('Не удалось сохранить новый порядок. Прежний порядок восстановлен.')).toBeVisible();
  });

  for (const width of [320, 390]) {
    test(`fields and handles fit without horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openEditor(page, { contextFields: fields }, []);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const sizes = await page.locator('.admin-context-field-row .admin-drag').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
      for (const height of sizes) expect(height).toBeGreaterThanOrEqual(44);
    });
  }

  test('scale levels of the sheet are reordered with arrows; the level number stays with its row', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const saved: Array<Record<string, unknown>> = [];
    await openEditor(page, { scoringMode: 'scale', scaleLevels: levels, contextFields: null }, saved);
    await openSettingsTab(page);
    const rows = page.locator('.admin-scale-level-row');
    await expect(rows).toHaveCount(3);
    const names = () => rows.evaluateAll((nodes) => nodes.map((node) => (node.querySelector('input') as HTMLInputElement).value));
    await expect.poll(names).toEqual(['Плохо', 'Нормально', 'Отлично']);
    await page.getByRole('button', { name: 'Переместить вверх: Отлично' }).click();
    await expect.poll(names).toEqual(['Плохо', 'Отлично', 'Нормально']);
    await expect(page.getByRole('button', { name: 'Переместить вверх: Плохо' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Переместить вниз: Нормально' })).toBeDisabled();
    // the settings are saved with the other settings; the level numbers (identity of an answer) travel with their rows
    await page.getByTestId('checklist-unsaved-bar').getByRole('button', { name: 'Сохранить' }).click();
    await expect.poll(() => (saved.at(-1)?.scaleLevels as Array<{ level: number; label: string }> | undefined)?.map((entry) => `${entry.level}:${entry.label}`)).toEqual(['1:Плохо', '3:Отлично', '2:Нормально']);
  });
});
