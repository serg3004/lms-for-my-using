import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { freshRolesState, installCustomRolesMocks } from '../fixtures/custom-roles.js';

for (const width of [375, 1440]) {
  test(`user creation with role and department is accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installCustomRolesMocks(page, freshRolesState());
    await page.route('**/api/v1/departments?*', (route) => route.fulfill({ json: {
      items: [{ id: 'dep-1', name: 'Учебный отдел', status: 'active' }],
      page: 1, pageSize: 100, total: 1,
    } }));
    await page.goto('/admin/users');
    await page.getByRole('button', { name: 'Создать пользователя' }).click();
    const dialog = page.getByRole('dialog', { name: 'Создать пользователя' });
    await expect(dialog.getByLabel('Роль', { exact: true })).toBeVisible();
    const department = dialog.getByLabel('Подразделение', { exact: true });
    await expect(department).toBeEnabled();
    await expect(department.getByRole('option', { name: 'Учебный отдел' })).toHaveCount(1);
    const result = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });
}
