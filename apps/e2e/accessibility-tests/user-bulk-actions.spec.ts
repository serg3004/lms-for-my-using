import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { installUserBulkMocks } from '../fixtures/user-bulk-actions.js';

for (const width of [375, 1440]) {
  test(`the users list with the bulk bar and the report is accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installUserBulkMocks(page);
    await page.goto('/admin/users');
    await page.getByRole('checkbox', { name: 'Сергеева Айгуль' }).check();
    await expect(page.getByRole('button', { name: 'Заблокировать' })).toBeVisible();
    const bar = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(bar.violations).toEqual([]);
    await page.getByRole('button', { name: 'Заблокировать' }).click();
    await expect(page.getByRole('dialog', { name: 'Результат' })).toBeVisible();
    const dialog = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(dialog.violations).toEqual([]);
  });
}
