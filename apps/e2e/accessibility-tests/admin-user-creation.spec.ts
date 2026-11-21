import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const width of [375, 1440]) {
  test(`user creation with role and department is accessible at ${width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    // /api/v1/auth/login allows 5 requests per 60s per account and the other accessibility specs share admin@demo.com,
    // so this login can get a 429 and stay on /login; wait out the window once (same pattern as instructor-workspace.spec.ts).
    for (let attempt = 1; attempt <= 2; attempt++) {
      await page.goto('/login');
      await page.locator('input[name="organizationId"]').fill('demo-company');
      await page.locator('input[name="email"]').fill('admin@demo.com');
      await page.locator('input[name="password"]').fill('Demo1234!');
      await page.locator('button[type="submit"]').click();
      try {
        await expect(page).toHaveURL(/\/admin$/, { timeout: 5000 });
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        await page.waitForTimeout(65_000);
      }
    }
    await page.goto('/admin/users');
    await page.getByRole('button', { name: 'Создать пользователя' }).click();
    const dialog = page.getByRole('dialog', { name: 'Создать пользователя' });
    await expect(dialog.getByLabel('Подразделение', { exact: true })).toBeEnabled();
    const result = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });
}
