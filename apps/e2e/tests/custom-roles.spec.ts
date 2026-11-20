import { expect, test } from '@playwright/test';

import { annaId, freshRolesState, installCustomRolesMocks, registrar } from '../fixtures/custom-roles.js';

for (const width of [390, 1280]) test(`admin creates a role, assigns it, sees the user's rights and removes it at ${width}px`, async ({ page }) => {
  const state = freshRolesState({ seeded: false, enabled: true });
  await installCustomRolesMocks(page, state);
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/admin/custom-roles');
  await expect(page.getByRole('heading', { name: 'Роли и права', level: 1 })).toBeVisible();
  await expect(page.getByText('Ролей пока нет')).toBeVisible();
  await expect(page.getByText('Индивидуальные роли включены')).toBeVisible();

  await page.getByRole('button', { name: 'Создать роль' }).click();
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Введите название роли')).toBeVisible();
  await expect(page.getByText('Выберите хотя бы одно право')).toBeVisible();

  await page.getByLabel('Название роли').fill('Регистратор отдела');
  // On a phone the groups of rights are folded; open the one needed.
  if (width < 768) await page.locator('summary', { hasText: 'Пользователи' }).click();
  await page.getByRole('checkbox', { name: 'Регистрировать пользователей' }).check();
  await expect(page.getByRole('checkbox', { name: 'Видеть пользователей' })).toBeChecked();
  await expect(page.getByText('Также добавлено то, что нужно этому праву')).toBeVisible();
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Роль сохранена.')).toBeVisible();
  expect(state.calls.some((call) => call.startsWith('create') && call.includes('user.create') && call.includes('user.read'))).toBe(true);

  await page.getByLabel('Кому назначить').selectOption({ label: 'Иванова Анна · anna@example.invalid' });
  await page.getByRole('button', { name: 'Назначить' }).click();
  await expect(page.getByText('Иванова Анна · anna@example.invalid').first()).toBeVisible();

  await page.goto('/admin/users');
  // On a phone the actions sit in the expandable details of the row.
  if (width < 768) await page.getByRole('button', { name: /Подробнее: Иванова/ }).click();
  await page.getByRole('button', { name: 'Права', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Регистратор отдела')).toBeVisible();
  await expect(dialog.getByText('Регистрировать пользователей')).toBeVisible();
  await expect(dialog.getByText('Моё подразделение').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Снять' }).click();
  await expect(dialog.getByText('Индивидуальных ролей нет')).toBeVisible();
  await expect(dialog.getByText('Регистрировать пользователей')).toHaveCount(0);
  expect(state.assignments).toEqual([]);
  void annaId;
});

test('a stale version is explained and the current version can be reloaded', async ({ page }) => {
  const state = freshRolesState();
  state.conflictOnce = true;
  await installCustomRolesMocks(page, state);
  await page.goto('/admin/custom-roles');
  await page.getByRole('button', { name: registrar.name }).click();
  await page.getByLabel('Название роли').fill('Моё название');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Роль уже изменил кто-то другой' })).toBeVisible();
  await page.getByRole('alert').getByRole('button', { name: 'Обновить' }).click();
  await expect(page.getByLabel('Название роли')).toHaveValue('Название от коллеги');
});

test('archiving asks first, an archived role is read-only and can be the base of a new one', async ({ page }) => {
  const state = freshRolesState();
  await installCustomRolesMocks(page, state);
  await page.goto('/admin/custom-roles');
  await page.getByRole('button', { name: registrar.name }).click();
  await page.getByRole('button', { name: 'Архивировать' }).click();
  const dialog = page.getByRole('dialog', { name: 'Архивировать роль' });
  await expect(dialog).toContainText('потеряют эти права со следующего запроса');
  await dialog.getByRole('button', { name: 'Архивировать', exact: true }).click();
  await expect(page.getByText('Роль в архиве: назначения перестанут действовать')).toBeVisible();
  expect(state.calls).toContain(`archive ${registrar.id} v2`);
  await expect(page.getByLabel('Название роли')).toBeDisabled();
  await page.getByRole('button', { name: 'Создать на основе этой' }).click();
  await expect(page.getByLabel('Название роли')).toHaveValue('Регистратор (копия)');
  await expect(page.getByRole('checkbox', { name: 'Регистрировать пользователей' })).toBeChecked();
});

test('turning the switch on asks first and keeps the other feature flag', async ({ page }) => {
  const state = freshRolesState({ enabled: false });
  await installCustomRolesMocks(page, state);
  await page.goto('/admin/custom-roles');
  await expect(page.getByText('Индивидуальные роли выключены')).toBeVisible();
  await page.getByRole('button', { name: 'Включить' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Включить' }).click();
  await expect(page.getByText('Индивидуальные роли включены')).toBeVisible();
  expect(state.calls).toContain('features {"longreadEnabled":false,"customRolesEnabled":true}');
});
