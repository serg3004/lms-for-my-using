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

async function fillCreateForm(page: Page, email: string, password: string) {
  const dialog = page.getByRole('dialog', { name: 'Создать пользователя' });
  await dialog.getByLabel('Фамилия').fill('Automation');
  await dialog.getByLabel('Имя').fill('Admin user');
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Пароль').fill(password);
  await dialog.getByLabel('Роль', { exact: true }).selectOption('learner');
}

test('admin creates, filters, edits, deactivates and reactivates a user', async ({ page, isolatedUser }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Пользователи' })).toBeVisible();

  await page.getByRole('button', { name: 'Создать пользователя' }).click();
  await page.getByLabel('Пароль').fill('CloseMustClear123!');
  await page.getByRole('dialog', { name: 'Создать пользователя' }).getByRole('button', { name: 'Отмена' }).click();
  await page.getByRole('button', { name: 'Создать пользователя' }).click();
  await expect(page.getByLabel('Пароль')).toHaveValue('');
  await fillCreateForm(page, 'admin@demo.com', 'Temporary123!');
  await page.getByRole('dialog', { name: 'Создать пользователя' }).getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Пользователь с таким email уже существует')).toBeVisible();
  await expect(page.getByLabel('Пароль')).toHaveValue('');

  await page.getByLabel('Email').fill(isolatedUser.email);
  await page.getByLabel('Пароль').fill('Temporary123!');
  await page.getByRole('dialog', { name: 'Создать пользователя' }).getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('dialog', { name: 'Создать пользователя' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Создать пользователя' }).click();
  await expect(page.getByLabel('Пароль')).toHaveValue('');
  await page.getByRole('dialog', { name: 'Создать пользователя' }).getByRole('button', { name: 'Отмена' }).click();

  await page.getByLabel('Поиск пользователей').fill(isolatedUser.email);
  const row = page.getByRole('row').filter({ hasText: isolatedUser.email });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Редактировать' }).click();
  const editDialog = page.getByRole('dialog', { name: 'Редактировать пользователя' });
  await editDialog.getByLabel('Имя').fill('Updated admin user');
  await editDialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(editDialog).not.toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Updated admin user' })).toBeVisible();

  await row.getByRole('button', { name: 'Деактивировать' }).click();
  await expect(row.getByText('suspended')).toBeVisible();
  await row.getByRole('button', { name: 'Активировать' }).click();
  await expect(row.getByText('active')).toBeVisible();
});
