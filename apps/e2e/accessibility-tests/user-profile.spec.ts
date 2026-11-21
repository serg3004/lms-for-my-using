import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { installUserProfileMocks } from '../fixtures/user-profile.js';

for (const width of [375, 1440]) {
  test(`the own profile card is accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installUserProfileMocks(page);
    await page.goto('/learn/profile');
    await expect(page.getByLabel('Телефон')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });
}
