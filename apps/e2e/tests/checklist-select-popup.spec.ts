import { expect, test, type Page } from '@playwright/test';
import { openFormattingEditor } from '../fixtures/checklist-formatting.js';

/** PR 453: every list opens as the app's own panel (rows are page elements with text), in the page and in a modal dialog. */
async function rowsAreReadable(page: Page) {
  const popup = page.getByTestId('select-popup');
  await expect(popup).toBeVisible();
  const rows = popup.getByRole('option');
  expect(await rows.count()).toBeGreaterThanOrEqual(2);
  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    expect((await row.innerText()).replace('✓', '').trim().length).toBeGreaterThan(0);
    expect((await row.boundingBox())?.height ?? 0).toBeGreaterThan(20);
  }
  return { popup, rows };
}

test('PR 453: the «Тип поля» list shows its rows as text and a click on a row changes the field', async ({ page }) => {
  await openFormattingEditor(page, 'ru', (sheet) => { sheet.feedbackEnabled = true; });
  const select = page.locator('select').filter({ has: page.locator('option[value="choice"]') }).first();
  await select.scrollIntoViewIfNeeded();
  await select.click();
  const { popup, rows } = await rowsAreReadable(page);
  const box = await popup.boundingBox();
  const field = await select.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(field!.x - 1);
  await rows.filter({ hasText: 'Выбор из набора ответов' }).click();
  await expect(popup).toBeHidden();
  await expect(select).toHaveValue('choice');
});

test('PR 453: a list inside the criterion dialog opens above the dialog and can be used', async ({ page }) => {
  await openFormattingEditor(page, 'ru', (sheet) => { sheet.feedbackEnabled = true; });
  await page.locator('.admin-criteria-row:not(.admin-criteria-row--head)').first().getByRole('button', { name: 'Действия', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Описание и пояснение…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Критерий: описание и пояснение' });
  await expect(dialog).toBeVisible();
  const select = dialog.locator('select').first();
  await select.click();
  const { rows } = await rowsAreReadable(page);
  const last = rows.last();
  const wanted = await last.innerText();
  await last.click();
  const chosen = await select.evaluate((element: HTMLSelectElement) => element.selectedOptions[0]?.textContent ?? '');
  expect(wanted.replace('✓', '').trim()).toBe(chosen.trim());
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('select-popup')).toBeHidden();
});

test('PR 453: keyboard works (Space opens, arrows and Enter choose, Escape closes) and the list stays on the screen at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openFormattingEditor(page, 'ru', (sheet) => { sheet.feedbackEnabled = true; });
  const select = page.locator('select').filter({ has: page.locator('option[value="choice"]') }).first();
  await select.scrollIntoViewIfNeeded();
  await select.focus();
  await expect(select).toBeFocused();
  await page.keyboard.press('Space');
  const { popup } = await rowsAreReadable(page);
  const box = await popup.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(321);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(select).toHaveValue('choice');
  await page.keyboard.press('Space');
  await expect(popup).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
});
