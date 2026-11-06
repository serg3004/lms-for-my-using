import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openCompletedResultPreview } from '../fixtures/checklist-learner-result.js';
for (const width of [320, 390]) test(`completed employee result is accessible at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await openCompletedResultPreview(page);
  const result = await new AxeBuilder({ page }).include('dialog[open]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});
