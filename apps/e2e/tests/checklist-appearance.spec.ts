import { expect, test } from '@playwright/test';
import { openFormattingEditor } from '../fixtures/checklist-formatting.js';

test('author styles the blocks, saves, and the preview shows the look', async ({ page }) => {
  const { saved, sheet } = await openFormattingEditor(page);
  const panel = page.getByTestId('checklist-appearance');
  await panel.getByRole('button', { name: 'Спокойный', exact: true }).click();
  await panel.getByRole('tab', { name: /^Критерий/ }).click();
  await panel.getByLabel('Фон', { exact: true }).fill('#fff7cc');
  await panel.getByLabel('Цвет текста', { exact: true }).fill('#000000');
  await expect(panel.getByTestId('checklist-appearance-sample')).toHaveCSS('background-color', 'rgb(255, 247, 204)');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).first().click();
  await expect.poll(() => (saved()?.appearance as { blocks?: Record<string, { background?: string }> } | undefined)?.blocks?.item?.background).toBe('#FFF7CC');
  expect((saved()?.appearance as { blocks: Record<string, unknown> }).blocks).toHaveProperty('header');
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  const preview = page.getByRole('dialog', { name: sheet.title as string });
  await expect(preview.getByRole('radiogroup').first().locator('xpath=..')).toHaveCSS('background-color', 'rgb(255, 247, 204)');
  await expect(preview.getByRole('heading', { level: 2 }).locator('xpath=ancestor::div[contains(@style,"border-radius")][1]')).toHaveCSS('border-top-left-radius', '20px');
});

test('low contrast warns, reset restores the standard look, and nothing scrolls sideways on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openFormattingEditor(page);
  const panel = page.getByTestId('checklist-appearance');
  await panel.getByLabel('Цвет текста', { exact: true }).fill('#cccccc');
  await expect(panel.getByRole('status')).toContainText('Низкий контраст');
  await panel.getByRole('button', { name: 'Сбросить к стандартному', exact: true }).click();
  await expect(panel.getByRole('status')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
