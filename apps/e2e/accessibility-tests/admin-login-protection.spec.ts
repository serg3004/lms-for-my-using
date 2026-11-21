import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { installLoginProtectionMocks } from '../fixtures/login-protection.js';

for (const width of [375, 1440]) {
  test(`security page with sign-in protection is accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installLoginProtectionMocks(page);
    await page.goto('/admin/security');
    await expect(page.getByText('Сергеева Айгуль')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });
}
