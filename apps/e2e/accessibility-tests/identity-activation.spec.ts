import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { installIdentityMocks } from '../fixtures/identity-activation.js';

for (const width of [375, 1440]) {
  test(`the activation page is accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installIdentityMocks(page);
    await page.goto('/activate');
    await expect(page.getByRole('heading', { name: 'Активация учётной записи' })).toBeVisible();
    // An error state is part of the page too: every field is then marked invalid and described.
    await page.getByRole('button', { name: 'Активировать' }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });

  test(`sign-in by employee number is accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installIdentityMocks(page);
    await page.goto('/login');
    await page.getByRole('button', { name: 'По табельному номеру' }).click();
    await expect(page.getByLabel('Табельный номер')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });
}
