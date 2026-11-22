import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { installLoginJournalMocks, journalUserId } from '../fixtures/login-journal.js';

for (const width of [375, 1440]) {
  test(`my devices in the profile are accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installLoginJournalMocks(page);
    await page.goto('/profile');
    await expect(page.getByText('Safari · iOS')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });

  test(`the sign-in journal of a person is accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installLoginJournalMocks(page, ['admin']);
    await page.goto(`/admin/users/${journalUserId}/logins`);
    await expect(page.getByText('вход выполнен')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });
}
