import { expect, test } from '@playwright/test';
import { openFormattingEditor } from '../fixtures/checklist-formatting.js';

type PreviewSheet = Parameters<NonNullable<Parameters<typeof openFormattingEditor>[2]>>[0];
const ids = ['4f2b8c1e-5d4a-4b6f-9a7c-1e2d3c4b5a69', '5a3c9d2f-6e5b-4c7a-8b8d-2f3e4d5c6b7a', '6b4d0e3a-7f6c-4d8b-9c9e-3a4f5e6d7c8b'];
/** Three criteria with uuid ids (the server keeps a look only for real ids). */
const threeCriteria = (sheet: PreviewSheet) => {
  const first = sheet.items[0]!;
  sheet.items = ids.map((id, index) => ({ ...first, id, order: index, text: `Критерий ${index + 1}` }));
};
const settings = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Настройки', exact: true });

test('author sets a block with its button, sees it change at once, saves, and the preview shows the look', async ({ page }) => {
  const { saved, sheet } = await openFormattingEditor(page, 'ru', (sheet) => { sheet.items[0]!.id = ids[0]!; });
  await expect(settings(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Оформление блока: Шапка', exact: true }).click();
  await expect(settings(page)).toBeVisible();
  await settings(page).getByRole('button', { name: 'Спокойный', exact: true }).click();
  const row = page.locator('.admin-criteria-row:not(.admin-criteria-row--head)').first();
  await row.getByRole('button', { name: /^Оформление блока:/ }).click();
  await expect(settings(page)).toContainText('Критерий');
  await settings(page).getByRole('button', { name: 'Фон #FFF7CC', exact: true }).click();
  await expect(row).toHaveCSS('background-color', 'rgb(255, 247, 204)');
  await settings(page).getByRole('button', { name: 'Цвет текста #172033', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить', exact: true }).first().click();
  await expect.poll(() => (saved()?.appearance as { overrides?: Record<string, { background?: string }> } | undefined)?.overrides?.[ids[0]!]?.background).toBe('#FFF7CC');
  expect((saved()?.appearance as { blocks: Record<string, unknown> }).blocks).toHaveProperty('header');
  await page.keyboard.press('Escape');
  await expect(settings(page)).toHaveCount(0);
  await expect(row.getByRole('button', { name: /^Оформление блока:/ })).toBeFocused();
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  const preview = page.getByRole('dialog', { name: sheet.title as string });
  await expect(preview.getByRole('radiogroup').first().locator('xpath=..')).toHaveCSS('background-color', 'rgb(255, 247, 204)');
  await expect(preview.getByRole('heading', { level: 2 }).locator('xpath=ancestor::div[contains(@style,"border-radius")][1]')).toHaveCSS('border-top-left-radius', '20px');
});

test('only this block can be styled, low contrast warns, reset restores the look, and the window fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openFormattingEditor(page, 'ru', (sheet) => { sheet.items[0]!.id = '4f2b8c1e-5d4a-4b6f-9a7c-1e2d3c4b5a69'; });
  const row = page.locator('.admin-criteria-row:not(.admin-criteria-row--head)').first();
  await row.getByRole('button', { name: /^Оформление блока:/ }).click();
  const panel = settings(page);
  await expect(panel.getByRole('radio', { name: 'Только этот блок' })).toHaveAttribute('aria-checked', 'true');
  await panel.getByRole('button', { name: 'Цвет текста #FFFFFF', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Низкий контраст');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.getByRole('button', { name: 'Сбросить к стандартному', exact: true }).click();
  await expect(panel.getByRole('status')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Закрыть настройки', exact: true }).click();
  await expect(panel).toHaveCount(0);
});

test('PR 440: the gear lies in the corner of the block and is neutral, and the whole sheet moves aside for the window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openFormattingEditor(page);
  const builder = page.getByTestId('checklist-builder');
  const gears = page.getByTestId('block-gear');
  const header = gears.first();
  const square = header.locator('span').first();
  await expect(square).toHaveCSS('width', '32px');
  await expect(square).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  const box = await header.boundingBox(), form = await header.locator('xpath=..').boundingBox();
  expect(Math.abs((form!.x + form!.width) - (box!.x + box!.width))).toBeLessThanOrEqual(2);
  expect(Math.abs(form!.y - box!.y)).toBeLessThanOrEqual(2);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  const before = await builder.boundingBox();
  await header.click();
  const panel = settings(page);
  await expect(panel).toBeVisible();
  await expect(header.locator('span').first()).toHaveCSS('color', 'rgb(79, 70, 229)');
  const panelBox = await panel.boundingBox(), after = await builder.boundingBox();
  expect(after!.x).toBe(before!.x);
  // The sheet (including the page header and the tabs) ends left of the window; "Save" stays reachable.
  for (const target of [page.getByRole('tab').first(), page.getByRole('button', { name: 'Предпросмотр', exact: true })]) {
    const rect = await target.boundingBox();
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(panelBox!.x);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(header).toBeFocused();
});

for (const width of [390, 320]) test(`PR 440: on a narrow screen (${width}px) the window comes up from the bottom and the page makes room`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await openFormattingEditor(page);
  await page.getByTestId('block-gear').first().click();
  const panel = settings(page);
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box!.y + box!.height).toBeGreaterThanOrEqual(799);
  expect(box!.height).toBeLessThanOrEqual(800 * 0.55 + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.getByTestId('checklist-builder').evaluate((element) => parseFloat(getComputedStyle(element).paddingBottom))).toBeGreaterThanOrEqual(800 * 0.55 - 1);
});

test('PR 441: a colour changes only the chosen criterion; "to all" is a separate explicit choice that shows how many it reaches', async ({ page }) => {
  await openFormattingEditor(page, 'ru', threeCriteria);
  const rows = page.locator('.admin-criteria-row:not(.admin-criteria-row--head)');
  await expect(rows).toHaveCount(3);
  await rows.nth(1).getByRole('button', { name: /^Оформление блока:/ }).click();
  const panel = settings(page);
  await expect(panel.getByRole('radio', { name: 'Только этот блок' })).toHaveAttribute('aria-checked', 'true');
  await expect(panel.getByRole('radio', { name: 'Ко всем критериям (3)' })).toHaveAttribute('aria-checked', 'false');
  await panel.getByRole('button', { name: 'Фон #FFF7CC', exact: true }).click();
  await expect(rows.nth(1)).toHaveCSS('background-color', 'rgb(255, 247, 204)');
  await expect(rows.nth(0)).not.toHaveCSS('background-color', 'rgb(255, 247, 204)');
  await expect(rows.nth(2)).not.toHaveCSS('background-color', 'rgb(255, 247, 204)');
  await panel.getByRole('radio', { name: 'Ко всем критериям (3)' }).click();
  await expect(panel.getByRole('note')).toContainText('У 1 блока свои настройки, они остаются.');
  await panel.getByRole('button', { name: 'Фон #EAF2FB', exact: true }).click();
  await expect(rows.nth(0)).toHaveCSS('background-color', 'rgb(234, 242, 251)');
  await expect(rows.nth(2)).toHaveCSS('background-color', 'rgb(234, 242, 251)');
  await expect(rows.nth(1)).toHaveCSS('background-color', 'rgb(255, 247, 204)');
  // The chosen scope is remembered for the next block while the sheet is open.
  await page.keyboard.press('Escape');
  await rows.nth(0).getByRole('button', { name: /^Оформление блока:/ }).click();
  await expect(settings(page).getByRole('radio', { name: 'Ко всем критериям (3)' })).toHaveAttribute('aria-checked', 'true');
});

test('PR 441: a sheet without groups still has a settings button for groups, and "Без группы" opens the same window', async ({ page }) => {
  await openFormattingEditor(page, 'ru', threeCriteria);
  const head = page.locator('.admin-builder-section-head', { hasText: 'Группы и критерии' });
  await head.getByRole('button', { name: /^Оформление блока:/ }).click();
  const panel = settings(page);
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('radio')).toHaveCount(0);
  await expect(panel.getByRole('note')).toContainText('все группы');
  await panel.getByRole('button', { name: 'Толщина границы: 2 px', exact: true }).click();
  await panel.getByRole('button', { name: 'Закрыть настройки', exact: true }).click();
  const card = page.locator('.admin-group-card').first();
  await card.getByRole('button', { name: /^Оформление блока: (Без группы|Группа)$/ }).click();
  await expect(settings(page)).toBeVisible();
  await expect(card).toHaveCSS('border-top-width', '2px');
});

test('PR 442: the feedback section has its own button, a set colours it, and the preview shows it', async ({ page }) => {
  const { saved, sheet } = await openFormattingEditor(page, 'ru', (data) => { data.feedbackEnabled = true; });
  const section = page.locator('.admin-feedback-block');
  await expect(section).toBeVisible();
  await section.getByRole('button', { name: 'Оформление блока: Обратная связь', exact: true }).click();
  await expect(settings(page)).toContainText('Обратная связь');
  await expect(settings(page).getByRole('radio')).toHaveCount(0);
  await settings(page).getByRole('button', { name: 'Контрастный', exact: true }).click();
  await expect(section).toHaveCSS('background-color', 'rgb(255, 247, 204)');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).first().click();
  await expect.poll(() => (saved()?.appearance as { blocks?: Record<string, { background?: string }> } | undefined)?.blocks?.feedback?.background).toBe('#FFF7CC');
  await page.keyboard.press('Escape');
  await expect(section.getByRole('button', { name: 'Оформление блока: Обратная связь', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  const preview = page.getByRole('dialog', { name: sheet.title as string });
  await expect(preview.locator('section:has(h3)').last().locator('xpath=..')).toHaveCSS('background-color', 'rgb(255, 247, 204)');
});
