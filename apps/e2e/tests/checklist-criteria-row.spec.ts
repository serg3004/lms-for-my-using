import { expect, test, type Page } from '@playwright/test';

// PR 403: header and criteria rows share one grid; fields keep readable sizes; long text wraps.
const longText = 'Проверить, что витрина выставлена по планограмме, ценники совпадают с ценой на кассе, а просроченный товар убран с полки и списан';
const items = [
  { id: 'item-1', checklistId: 'checklist-1', order: 1, text: 'Включить свет', points: 10, isRequired: true, photoRequired: false, weight: 1, groupId: null },
  { id: 'item-2', checklistId: 'checklist-1', order: 2, text: longText, points: 20, isRequired: false, photoRequired: true, weight: 2, groupId: null },
];

async function openEditor(page: Page, scoringMode: 'sum_points' | 'all_required') {
  const checklist = {
    id: 'checklist-1', organizationId: 'org', title: 'Opening shift checklist', description: null, status: 'draft', scoringMode,
    passThreshold: 80, scaleLevels: null, requiresReview: false, createdBy: 'admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    items, itemGroups: [], contextFields: null,
    moduleSettings: { thresholds: null, resultColors: null, feedbackVisibility: null, observers: null, defaultLocationCapturePolicy: null }, hasModuleOverrides: false,
  };
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Ada', lastName: 'Admin', roles: ['admin'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklists/checklist-1') return route.fulfill({ json: checklist });
    if (path === '/checklists') return route.fulfill({ json: [checklist] });
    if (path === '/checklist-scales' || path.endsWith('/groups')) return route.fulfill({ json: [] });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.goto('/admin/checklists');
  if (page.viewportSize()!.width <= 860) await page.getByRole('button', { name: /Opening shift checklist$/ }).click();
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await expect(page.getByRole('heading', { name: /Группы и критерии/ })).toBeVisible();
}

const box = (page: Page, selector: string) => page.locator(selector).first().evaluate((node) => {
  const r = node.getBoundingClientRect();
  return { left: r.left, right: r.right, width: r.width, height: r.height, top: r.top };
});

test.describe('Checklist editor: criterion row (PR 403)', () => {
  for (const mode of ['sum_points', 'all_required'] as const) {
    for (const width of [360, 768, 1280, 1920]) {
      test(`${mode} at ${width}px: fields are readable, nothing overflows, text is fully visible`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1400 });
        await openEditor(page, mode);
        await page.locator('.admin-group-card').first().screenshot({ path: `/tmp/pr403-${mode}-${width}.png` });

        const table = await box(page, '.admin-criteria-table');
        const rowCount = await page.locator('.admin-criteria-row:not(.admin-criteria-row--head)').count();
        expect(rowCount).toBe(2);
        const wide = table.width >= 760;

        const cells = await page.locator('.admin-criteria-row:not(.admin-criteria-row--head)').nth(1).evaluate((row) => {
          const r = (selector: string) => { const e = row.querySelector(selector) as HTMLElement | null; if (!e) return null; const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, width: b.width, height: b.height, scrollHeight: e.scrollHeight, clientHeight: e.clientHeight }; };
          return { text: r('textarea'), scale: r('select'), points: r('.admin-criteria-row__points'), weight: r('.admin-criteria-row__weight'), menu: r('.admin-criteria-row__menu'), rowRight: row.getBoundingClientRect().right };
        });
        // The long text is never clipped: no hidden overflow inside its field.
        expect(cells.text!.scrollHeight).toBeLessThanOrEqual(cells.text!.clientHeight + 2);
        expect(cells.weight!.width).toBeGreaterThanOrEqual(64);
        if (mode === 'sum_points') expect(cells.points!.width).toBeGreaterThanOrEqual(64);
        else expect(cells.points).toBeNull();
        expect(cells.menu!.right).toBeLessThanOrEqual(cells.rowRight + 1);
        if (width <= 860) {
          expect(cells.weight!.height).toBeGreaterThanOrEqual(44);
          expect(cells.scale!.height).toBeGreaterThanOrEqual(44);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

        if (wide) {
          // Titles stand over their columns: the header cell and the field share the same centre.
          const centres = await page.locator('.admin-criteria-table').first().evaluate((tableNode) => {
            const head = Array.from(tableNode.querySelectorAll('.admin-criteria-row--head > span'));
            const row = tableNode.querySelector('.admin-criteria-row:not(.admin-criteria-row--head)')!;
            const cellsInRow = Array.from(row.children);
            return head.map((h, i) => {
              const a = h.getBoundingClientRect();
              const b = cellsInRow[i]!.getBoundingClientRect();
              return { head: a.left + a.width / 2, cell: b.left + b.width / 2, text: h.textContent };
            });
          });
          expect(centres.length).toBe(mode === 'sum_points' ? 9 : 8);
          for (const column of centres.slice(3)) expect(Math.abs(column.head - column.cell)).toBeLessThanOrEqual(2);
          // "Обязательный" is not broken letter by letter.
          const required = await page.locator('.admin-criteria-row--head > span', { hasText: /^Обязательн/ }).first().evaluate((node) => node.getBoundingClientRect().height);
          expect(required).toBeLessThanOrEqual(40);
        } else {
          await expect(page.locator('.admin-criteria-row--head').first()).toBeHidden();
          await expect(page.locator('.admin-criteria-cell > span:visible').first()).toBeVisible();
        }
      });
    }
  }

  test('tab order follows the row left to right', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1400 });
    await openEditor(page, 'sum_points');
    const row = page.locator('.admin-criteria-row:not(.admin-criteria-row--head)').first();
    await row.getByRole('button', { name: /Перетащить критерий/ }).focus();
    const seen: string[] = [];
    for (let step = 0; step < 9; step += 1) {
      seen.push(await page.evaluate(() => { const e = document.activeElement as HTMLElement; return e.getAttribute('aria-label') ?? e.textContent ?? ''; }));
      await page.keyboard.press('Tab');
    }
    // The first row's "up" arrow is disabled, so focus skips it.
    expect(seen.map((label) => label.replace(/:.*/, ''))).toEqual([
      'Перетащить критерий', 'Переместить вниз', 'Критерий', 'Шкала', 'Баллы', 'Вес', 'Обязательный пункт', 'Требуется фото', '⋮Действия',
    ]);
  });
});
