import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { badgeToken, installEmployeeCardMocks, type CardMode } from '../fixtures/employee-card.js';

for (const width of [375, 1440]) {
  for (const mode of ['peer', 'anonymous'] as CardMode[]) {
    test(`the employee card (${mode}) is accessible at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await installEmployeeCardMocks(page, mode);
      await page.goto(`/employee-card#${badgeToken}`);
      await expect(page.getByRole(mode === 'peer' ? 'heading' : 'alert').first()).toBeVisible();
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(result.violations).toEqual([]);
    });
  }
}
