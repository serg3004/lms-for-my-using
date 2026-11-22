import { expect, test } from '@playwright/test';

import { installUserBulkMocks } from '../fixtures/user-bulk-actions.js';

test('PR 497: the administrator blocks chosen people and reads the report, then archives after seeing the impact', async ({ page }) => {
  const calls = await installUserBulkMocks(page);
  await page.goto('/admin/users');
  await page.getByRole('checkbox', { name: 'Сергеева Айгуль' }).check();
  await page.getByRole('checkbox', { name: 'Таков Борис' }).check();
  const bar = page.getByRole('region', { name: 'Выбрано: 2' });
  await expect(bar).toBeVisible();

  await bar.getByRole('button', { name: 'Заблокировать' }).click();
  const result = page.getByRole('dialog', { name: 'Результат' });
  await expect(result).toContainText('Запрошено: 2. Выполнено: 1. Уже в таком состоянии: 0. Не выполнено: 1.');
  await expect(result).toContainText('это последний действующий администратор');
  expect(calls.actions).toHaveLength(1);
  expect(calls.actions[0]).toMatchObject({ action: 'suspend' });
  expect((calls.actions[0]?.userIds as string[]).length).toBe(2);
  await result.getByRole('button', { name: 'Закрыть' }).click();

  await page.getByRole('checkbox', { name: 'Сергеева Айгуль' }).check();
  await page.getByRole('checkbox', { name: 'Таков Борис' }).check();
  await page.getByRole('region', { name: 'Выбрано: 2' }).getByRole('button', { name: 'Архивировать' }).click();
  const confirm = page.getByRole('dialog', { name: 'Архивировать пользователей: 2' });
  await expect(confirm).toContainText('Незавершённые сессии наблюдения: 1');
  await expect(confirm).toContainText('Открытые назначения курсов: 5');
  expect(calls.actions).toHaveLength(1);
  await confirm.getByRole('button', { name: 'Архивировать' }).click();
  await expect(page.getByRole('dialog', { name: 'Результат' })).toBeVisible();
  expect(calls.actions[1]).toMatchObject({ action: 'archive', confirm: true });
});

test('PR 497: everyone matching the filter can be chosen, and people are moved to a department', async ({ page }) => {
  const calls = await installUserBulkMocks(page);
  await page.goto('/admin/users');
  await page.getByRole('checkbox', { name: 'Выбрать все строки на странице' }).check();
  await page.getByRole('button', { name: 'Выбрать всех, подходящих под фильтр: 45' }).click();
  await expect(page.getByText('Выбраны все подходящие под фильтр: 45.')).toBeVisible();

  await page.getByRole('button', { name: 'Сменить подразделение' }).click();
  const dialog = page.getByRole('dialog', { name: 'Сменить подразделение' });
  await expect(dialog.getByRole('button', { name: 'Перевести' })).toBeDisabled();
  await dialog.getByLabel('Подразделение').selectOption({ label: 'Склад' });
  await dialog.getByRole('button', { name: 'Перевести' }).click();
  await expect(page.getByRole('dialog', { name: 'Результат' })).toBeVisible();
  expect(calls.actions[0]).toEqual({ action: 'move', filter: {}, departmentId: 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1' });
});

test('PR 497: a manager is not offered archiving', async ({ page }) => {
  await installUserBulkMocks(page, ['manager']);
  await page.goto('/admin/users');
  await page.getByRole('checkbox', { name: 'Сергеева Айгуль' }).check();
  const bar = page.getByRole('region', { name: 'Выбрано: 1' });
  await expect(bar.getByRole('button', { name: 'Заблокировать' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Архивировать' })).toHaveCount(0);
});
