import { expect, test } from '@playwright/test';

// PR 577: the theme is chosen from a labelled menu; the choice is kept after a reload without a flash of the other theme.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Ada', lastName: 'Admin', roles: ['admin'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklists' || path === '/checklist-scales') return route.fulfill({ json: [] });
    if (path === '/checklist-folders') return route.fulfill({ json: { folders: [], rootChecklistCount: 0, checklistCount: 0 } });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
});

test('the menu names the themes, marks the chosen one and keeps it after a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/admin/checklists');
  await page.getByRole('button', { name: /^Тема оформления:/ }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitemradio')).toHaveText([/Светлая/, /Тёмная/, /Контрастная/, /Как на устройстве.*сейчас светлая/]);
  await expect(menu.getByRole('menuitemradio', { name: /Как на устройстве/ })).toHaveAttribute('aria-checked', 'true');

  await menu.getByRole('menuitemradio', { name: 'Тёмная' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(menu).toBeHidden();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Тема оформления: Тёмная' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Тёмная' })).toHaveAttribute('aria-checked', 'true');
});

test('the menu opens and closes from the keyboard', async ({ page }) => {
  await page.goto('/admin/checklists');
  const button = page.getByRole('button', { name: /^Тема оформления:/ });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitemradio').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(button).toBeFocused();
});

// PR 578: the high-contrast theme is one more item of the same menu and is remembered like the others.
test('the high-contrast theme is chosen from the menu and kept after a reload', async ({ page }) => {
  await page.goto('/admin/checklists');
  await page.getByRole('button', { name: /^Тема оформления:/ }).click();
  await page.getByRole('menuitemradio', { name: 'Контрастная' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).color)).toBe('rgb(0, 0, 0)');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
  await page.getByRole('button', { name: 'Тема оформления: Контрастная' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Контрастная' })).toHaveAttribute('aria-checked', 'true');
});
