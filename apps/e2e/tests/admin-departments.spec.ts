import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/isolated-test.js';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('input[name="organizationId"]').fill('demo-company');
  await page.locator('input[name="email"]').fill('admin@demo.com');
  await page.locator('input[name="password"]').fill('Demo1234!');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin$/);
}

test('admin creates a department tree, edits, moves, archives and restores a department', async ({ page }, testInfo) => {
  const suffix = `${testInfo.workerIndex}-${Date.now()}`;
  const rootName = `E2E Root ${suffix}`;
  const childName = `E2E Child ${suffix}`;

  await loginAsAdmin(page);
  await page.goto('/admin/departments');
  await expect(page.getByRole('heading', { name: 'Подразделения' })).toBeVisible();

  // Create a root department.
  await page.getByRole('button', { name: /Добавить корневое подразделение/ }).click();
  const createDialog = page.getByRole('dialog').filter({ hasText: 'Добавить корневое подразделение' });
  await createDialog.getByLabel('Название').fill(rootName);
  await createDialog.getByRole('button', { name: 'Создать' }).click();
  await expect(createDialog).not.toBeVisible();

  const tree = page.getByRole('tree', { name: 'Дерево подразделений' });
  const rootItem = tree.getByRole('treeitem', { name: new RegExp(rootName) });
  await expect(rootItem).toBeVisible();

  // Select the root and add a child department.
  await rootItem.click();
  await page.getByRole('button', { name: 'Добавить дочернее' }).click();
  const createChildDialog = page.getByRole('dialog').filter({ hasText: 'Добавить дочернее подразделение' });
  await createChildDialog.getByLabel('Название').fill(childName);
  await createChildDialog.getByRole('button', { name: 'Создать' }).click();
  await expect(createChildDialog).not.toBeVisible();

  const childItem = tree.getByRole('treeitem', { name: new RegExp(childName) });
  await expect(childItem).toBeVisible();

  // Edit the child's name.
  await childItem.click();
  await page.getByRole('button', { name: 'Редактировать' }).click();
  const editDialog = page.getByRole('dialog').filter({ hasText: 'Редактировать подразделение' });
  // No parentheses -- `new RegExp(updatedChildName)` below treats them as a capture group,
  // not literal characters, and would then fail to match the literal rendered text.
  const updatedChildName = `${childName} updated`;
  await editDialog.getByLabel('Название').fill(updatedChildName);
  await editDialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(editDialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: updatedChildName })).toBeVisible();

  // Move the child back to the root level.
  await page.getByRole('button', { name: 'Переместить' }).click();
  const moveDialog = page.getByRole('dialog').filter({ hasText: updatedChildName });
  await moveDialog.getByRole('combobox').selectOption({ label: 'Корневой уровень (без родителя)' });
  await moveDialog.getByRole('button', { name: 'Переместить' }).click();
  await expect(moveDialog).not.toBeVisible();
  await expect(tree.getByRole('treeitem', { name: new RegExp(updatedChildName) })).toBeVisible();

  // Archive it, then restore it from the detail panel.
  await page.getByRole('button', { name: 'В архив' }).click();
  await page.getByRole('dialog', { name: 'Архивировать подразделение' }).getByRole('button', { name: 'В архив' }).click();
  await expect(page.getByText('В архиве')).toBeVisible();
  await page.getByRole('button', { name: 'Восстановить' }).click();
  await expect(page.getByRole('button', { name: 'В архив' })).toBeVisible();
});

test('admin manages department types', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/departments');

  await page.getByRole('button', { name: 'Типы подразделений' }).click();
  // Plain `.filter({ hasText })`, not `getByRole('dialog', { name })` -- this dialog has no
  // `aria-labelledby` (unlike AdminUserDialog), so it exposes no accessible name to match on.
  const dialog = page.getByRole('dialog').filter({ hasText: 'Типы подразделений' });
  await expect(dialog).toBeVisible();

  const code = `e2e-type-${Date.now()}`;
  await dialog.getByPlaceholder('Код').fill(code);
  await dialog.getByPlaceholder('Название').fill('E2E Type');
  await dialog.getByRole('button', { name: 'Добавить' }).click();

  const row = dialog.getByRole('listitem').filter({ hasText: 'E2E Type' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'В архив' }).click();
  await expect(row.getByText('В архиве')).toBeVisible();
  await row.getByRole('button', { name: 'Восстановить' }).click();
  await expect(row.getByText('В архиве')).not.toBeVisible();
});
