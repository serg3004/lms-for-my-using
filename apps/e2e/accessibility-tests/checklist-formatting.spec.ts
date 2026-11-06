import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openFormattingPopup, openFormattingEditor, selectDescription } from '../fixtures/checklist-formatting.js';

for (const width of [320, 390]) test(`description formatting window is accessible at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await openFormattingPopup(page);
  const result = await new AxeBuilder({ page }).include('[aria-label="Форматирование текста"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});

for (const width of [320, 390]) test(`author rich text fields and their formatting window are accessible at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await openFormattingEditor(page);
  const title = page.locator('#checklist-title');
  await selectDescription(title); await page.keyboard.press('Shift+F10');
  const result = await new AxeBuilder({ page }).include('[contenteditable]').include('[aria-label="Форматирование текста"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});
