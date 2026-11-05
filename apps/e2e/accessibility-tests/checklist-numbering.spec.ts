import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openUnnumberedPreview } from '../fixtures/checklist-numbering.js';

for (const width of [320, 390]) test(`unnumbered sheet is accessible at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await openUnnumberedPreview(page);
  const result = await new AxeBuilder({ page }).include('dialog[open]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});
