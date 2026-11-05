import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openFormattingPopup } from '../fixtures/checklist-formatting.js';

for (const width of [320, 390]) test(`description formatting window is accessible at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await openFormattingPopup(page);
  const result = await new AxeBuilder({ page }).include('[aria-label="Форматирование текста"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});
