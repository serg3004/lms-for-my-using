import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { importFileCsv, installUsersImportMocks } from '../fixtures/users-import.js';

for (const width of [375, 1440]) {
  test(`user import page with a checked file is accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installUsersImportMocks(page);
    await page.goto('/admin/users/import');
    await page.getByLabel('Выберите файл').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(importFileCsv) });
    await page.getByRole('button', { name: 'Проверить' }).click();
    await expect(page.getByText('Подразделение не найдено.')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });
}
