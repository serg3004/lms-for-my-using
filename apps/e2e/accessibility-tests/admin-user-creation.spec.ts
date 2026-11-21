import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const width of [375, 1440]) {
  test(`user creation with role and department is accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');
    await page.locator('input[name="organizationId"]').fill('demo-company');
    await page.locator('input[name="email"]').fill('admin@demo.com');
    await page.locator('input[name="password"]').fill('Demo1234!');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/admin/users');
    await page.getByRole('button', { name: 'Создать пользователя' }).click();
    const dialog = page.getByRole('dialog', { name: 'Создать пользователя' });
    await expect(dialog.getByLabel('Подразделение', { exact: true })).toBeEnabled();
    const result = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });
}
