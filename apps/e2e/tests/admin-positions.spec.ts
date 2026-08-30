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

async function createLearner(page: Page, email: string) {
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Создать пользователя' }).click();
  const dialog = page.getByRole('dialog', { name: 'Создать пользователя' });
  await dialog.getByLabel('Фамилия').fill('Position');
  await dialog.getByLabel('Имя').fill('Candidate');
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Пароль').fill('Temporary123!');
  await dialog.getByLabel('Роль', { exact: true }).selectOption('learner');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(dialog).not.toBeVisible();
}

async function createRootDepartment(page: Page, name: string) {
  await page.getByRole('button', { name: /Добавить корневое подразделение/ }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Добавить корневое подразделение' });
  await dialog.getByLabel('Название').fill(name);
  await dialog.getByRole('button', { name: 'Создать' }).click();
  await expect(dialog).not.toBeVisible();
}

// One test, one admin login: Position CRUD (create/edit/archive/restore) and its selector in the
// department-users "add membership" flow share the same account-level login rate limit as every
// other admin-flow spec in this suite (5 logins/minute).
test('admin manages positions and assigns one to a department membership', async ({ page }, testInfo) => {
  const suffix = `${testInfo.workerIndex}-${Date.now()}`;
  const memberEmail = `e2e-position-member-${suffix}@example.invalid`;
  const deptName = `E2E Position Dept ${suffix}`;
  const code = `e2e-lead-${suffix}`;
  const title = `E2E Team Lead ${suffix}`;

  await loginAsAdmin(page);
  await createLearner(page, memberEmail);

  // ── Position CRUD: create, edit, archive, restore ──
  await page.goto('/admin/positions');
  await page.getByRole('button', { name: 'Добавить должность' }).click();
  const createDialog = page.getByRole('dialog').filter({ hasText: 'Добавить должность' });
  await createDialog.getByLabel('Код').fill(code);
  await createDialog.getByLabel('Название').fill(title);
  await createDialog.getByRole('button', { name: 'Создать' }).click();
  await expect(createDialog).not.toBeVisible();

  const row = page.getByRole('row').filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(row.getByText('Активна')).toBeVisible();

  const updatedTitle = `${title} Updated`;
  await row.getByRole('button', { name: 'Изменить' }).click();
  const editDialog = page.getByRole('dialog').filter({ hasText: 'Изменить должность' });
  await editDialog.getByLabel('Название').fill(updatedTitle);
  await editDialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(editDialog).not.toBeVisible();

  const updatedRow = page.getByRole('row').filter({ hasText: updatedTitle });
  await expect(updatedRow).toBeVisible();

  await updatedRow.getByRole('button', { name: 'В архив' }).click();
  await expect(updatedRow.getByText('В архиве')).toBeVisible();

  await updatedRow.getByRole('button', { name: 'Восстановить' }).click();
  await expect(updatedRow.getByText('Активна')).toBeVisible();

  // ── Position selector: assign it to a new department membership ──
  await page.goto('/admin/departments');
  await createRootDepartment(page, deptName);

  const tree = page.getByRole('tree', { name: 'Дерево подразделений' });
  await tree.getByRole('treeitem', { name: new RegExp(deptName) }).click();
  await page.getByRole('link', { name: 'Сотрудники' }).click();
  await expect(page).toHaveURL(/\/admin\/departments\/.+\/users$/);
  await expect(page.getByRole('heading', { name: deptName })).toBeVisible();

  await page.locator('.admin-membership-add input[type="search"]').fill(memberEmail);
  await page.locator('.admin-membership-add').getByLabel('Выберите пользователя…').selectOption({ label: 'Candidate Position' });
  await page.locator('.admin-membership-add').getByLabel('Выберите должность (необязательно)…').selectOption({ label: updatedTitle });
  await page.getByRole('button', { name: 'Добавить' }).click();

  const memberRow = page.getByRole('row').filter({ hasText: 'Candidate Position' });
  await expect(memberRow).toBeVisible();
});
