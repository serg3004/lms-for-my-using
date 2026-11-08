import { expect, test, type Page } from '@playwright/test';
import { openFormattingEditor } from '../fixtures/checklist-formatting.js';

/** Contrast of the rows of every drop-down list on the page: option text against the row (the option's own fill, else the field's). */
async function listContrasts(page: Page) {
  return page.evaluate(() => {
    const parse = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number) as [number, number, number, number?];
    const lum = ([r, g, b]: number[]) => { const [x, y, z] = [r, g, b].map((c) => { const v = c! / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * x! + 0.7152 * y! + 0.0722 * z!; };
    return [...document.querySelectorAll('select')].filter((select) => select.getClientRects().length).map((select) => {
      const field = getComputedStyle(select), option = select.querySelector('option')!, row = getComputedStyle(option);
      const fill = parse(row.backgroundColor)[3] === 0 ? parse(field.backgroundColor) : parse(row.backgroundColor);
      const [hi, lo] = [lum(parse(row.color)), lum(fill)].sort((a, b) => b - a);
      const box = select.getBoundingClientRect(), parent = select.parentElement!.getBoundingClientRect();
      return { name: select.id || select.getAttribute('aria-label') || option.textContent, contrast: (hi! + 0.05) / (lo! + 0.05), right: box.right, parentRight: parent.right, viewport: window.innerWidth, scrollOk: document.documentElement.scrollWidth <= window.innerWidth };
    });
  });
}

for (const width of [1280, 320]) {
  test(`PR 444: every drop-down list of the editor shows readable rows and fits its field at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1400 });
    await openFormattingEditor(page, 'ru', (sheet) => { sheet.feedbackEnabled = true; });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const lists = await listContrasts(page);
      expect(lists.length).toBeGreaterThanOrEqual(3);
      for (const list of lists) {
        expect(list.contrast, `${list.name} (${scheme})`).toBeGreaterThanOrEqual(4.5);
        expect(list.right, `${list.name} stays inside its field`).toBeLessThanOrEqual(Math.min(list.parentRight, list.viewport) + 1);
      }
      expect(lists.every((list) => list.scrollOk)).toBe(true);
    }
  });
}

test('PR 444: the criterion dialog and a styled feedback section keep readable rows', async ({ page }) => {
  await openFormattingEditor(page, 'ru', (sheet) => { sheet.feedbackEnabled = true; });
  await page.getByRole('button', { name: 'Оформление блока: Обратная связь', exact: true }).click();
  await page.getByRole('dialog', { name: 'Настройки', exact: true }).getByRole('button', { name: 'Контрастный', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.locator('.admin-criteria-row:not(.admin-criteria-row--head)').first().getByRole('button', { name: 'Действия', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Описание и пояснение…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Критерий: описание и пояснение' })).toBeVisible();
  const lists = await listContrasts(page);
  expect(lists.length).toBeGreaterThanOrEqual(4);
  for (const list of lists) expect(list.contrast, String(list.name)).toBeGreaterThanOrEqual(4.5);
});
