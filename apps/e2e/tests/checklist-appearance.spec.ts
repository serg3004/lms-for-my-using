import { expect, test } from '@playwright/test';
import { openFormattingEditor } from '../fixtures/checklist-formatting.js';

const settings = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Настройки', exact: true });

test('author sets a block with its button, sees it change at once, saves, and the preview shows the look', async ({ page }) => {
  const { saved, sheet } = await openFormattingEditor(page);
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
  await expect.poll(() => (saved()?.appearance as { blocks?: Record<string, { background?: string }> } | undefined)?.blocks?.item?.background).toBe('#FFF7CC');
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
  await panel.getByRole('radio', { name: 'только к этому блоку' }).check();
  await panel.getByRole('button', { name: 'Цвет текста #FFFFFF', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Низкий контраст');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.getByRole('button', { name: 'Сбросить этот блок', exact: true }).click();
  await expect(panel.getByRole('status')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Закрыть настройки', exact: true }).click();
  await expect(panel).toHaveCount(0);
});
