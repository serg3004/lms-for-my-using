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
  await dialog.getByLabel('Пароль (необязательно)').fill(password);
  await dialog.getByLabel('Роль', { exact: true }).selectOption('learner');
}

test('admin manages users and pending invitations', async ({ page, isolatedUser }) => {
  const login = await page.request.post('http://127.0.0.1:3000/api/v1/auth/login', { data: { organizationId: 'demo-company', email: 'admin@demo.com', password: 'Demo1234!' } });
  const loginBody = await login.json();
  const session = loginBody.data ?? loginBody;
  const createdDepartment = await page.request.post('http://127.0.0.1:3000/api/v1/departments', { headers: { Authorization: `Bearer ${session.accessToken}` }, data: { organizationId: session.user.organizationId, name: `Creation ${isolatedUser.externalId}` } });
  expect(createdDepartment.ok()).toBeTruthy();
  await loginAsAdmin(page);
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Пользователи' })).toBeVisible();

  await page.getByRole('button', { name: 'Создать пользователя' }).click();
  await page.getByLabel('Пароль (необязательно)').fill('CloseMustClear123!');
  await page.getByRole('dialog', { name: 'Создать пользователя' }).getByRole('button', { name: 'Отмена' }).click();
  await page.getByRole('button', { name: 'Создать пользователя' }).click();
  await expect(page.getByLabel('Пароль (необязательно)')).toHaveValue('');
  // The eye button shows and hides the typed password.
  await page.getByLabel('Пароль (необязательно)').fill('EyeCheck123!');
  await expect(page.getByLabel('Пароль (необязательно)')).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Показать пароль' }).click();
  await expect(page.getByLabel('Пароль (необязательно)')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Скрыть пароль' }).click();
  await expect(page.getByLabel('Пароль (необязательно)')).toHaveAttribute('type', 'password');
  await fillCreateForm(page, 'admin@demo.com', 'Temporary123!');
  await page.getByRole('dialog', { name: 'Создать пользователя' }).getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Пользователь с таким email уже существует')).toBeVisible();
  await expect(page.getByLabel('Пароль (необязательно)')).toHaveValue('');

  const department = page.getByLabel('Подразделение', { exact: true });
  await expect(department).toBeEnabled();
  const departmentId = await department.locator('option').evaluateAll((options) => (options as HTMLOptionElement[]).find((option) => option.value)?.value);
  expect(departmentId).toBeTruthy();
  await department.selectOption(departmentId!);
  const creationRequests: Array<{ url: string; body: Record<string, unknown> }> = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/(users|memberships)$/.test(request.url())) creationRequests.push({ url: request.url(), body: request.postDataJSON() });
  });
  await page.getByLabel('Email').fill(isolatedUser.email);
  await page.getByLabel('Пароль (необязательно)').fill('Temporary123!');
  await page.getByRole('dialog', { name: 'Создать пользователя' }).getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('dialog', { name: 'Создать пользователя' })).not.toBeVisible();
  expect(creationRequests).toHaveLength(1);
  expect(creationRequests[0]?.body).toMatchObject({ role: 'learner', departmentId });
  await page.getByRole('button', { name: 'Создать пользователя' }).click();
  await expect(page.getByLabel('Пароль (необязательно)')).toHaveValue('');
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
  const deactivateDialog = page.getByRole('dialog', { name: 'Деактивировать пользователя' });
  await expect(deactivateDialog).toContainText('Пользователь потеряет доступ к системе.');
  await deactivateDialog.getByRole('button', { name: 'Деактивировать', exact: true }).click();
  await expect(row.getByText('Заблокирован')).toBeVisible();
  await row.getByRole('button', { name: 'Активировать' }).click();
  await expect(row.getByText('Активен')).toBeVisible();

  await test.step('extend, resend and revoke a pending invitation', async () => {
    const inviteEmail = isolatedUser.email.replace('@', '-invite@');
    await page.getByRole('button', { name: 'Создать пользователя' }).click();
    await fillCreateForm(page, inviteEmail, '');
    await page.getByRole('dialog', { name: 'Создать пользователя' }).getByRole('button', { name: 'Сохранить' }).click();

    const result = page.getByRole('dialog', { name: 'Приглашение' });
    await expect(result).toBeVisible();
    await result.getByRole('button', { name: 'Закрыть' }).first().click();
    await page.getByRole('button', { name: 'Ожидают входа' }).click();
    const table = page.getByRole('table', { name: 'Ожидают входа' });
    const row = table.getByRole('row').filter({ hasText: inviteEmail });
    await expect(row.getByText('Ожидает', { exact: true })).toBeVisible();

    await row.getByRole('button', { name: 'Продлить на 7 дней' }).click();
    await expect(page.getByText('Срок приглашения продлён.')).toBeVisible();
    await row.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Отправить выбранным' }).click();
    await expect(page.getByText('Приглашение уже отправляли. Повторите через минуту.')).toBeVisible();

    await row.getByRole('button', { name: 'Отозвать' }).click();
    await page.getByRole('dialog', { name: 'Отозвать' }).getByRole('button', { name: 'Отозвать' }).click();
    await expect(row.getByText('Отозвано', { exact: true })).toBeVisible();
  });
});
