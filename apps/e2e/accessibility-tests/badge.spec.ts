import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { badgeToken, installBadgeMocks, newBadgeState } from '../fixtures/badge.js';

for (const width of [375, 1440]) {
  test(`the badge scan screen is accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installBadgeMocks(page, newBadgeState());
    await page.goto('/badge');
    await expect(page.getByLabel('Код бейджа')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });

  test(`the PIN pad is accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installBadgeMocks(page, newBadgeState());
    await page.goto(`/badge#${badgeToken}`);
    await expect(page.getByRole('heading', { name: 'Введите PIN' })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });
}
