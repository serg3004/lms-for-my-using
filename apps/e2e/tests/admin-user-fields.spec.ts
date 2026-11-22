import { expect, test } from '@playwright/test';

import { installUserFieldsMocks } from '../fixtures/user-fields.js';

test('PR 500: the standard fields are listed and an admin adds a new one', async ({ page }) => {
  const calls = await installUserFieldsMocks(page);
  await page.goto('/admin/user-fields');
  await expect(page.getByRole('heading', { name: 'Поля пользователя', level: 1 })).toBeVisible();
  await expect(page.getByText('Табельный номер').first()).toBeVisible();
  await expect(page.getByText('График работы').first()).toBeVisible();

  await page.getByRole('button', { name: 'Добавить поле' }).click();
  const dialog = page.getByRole('dialog', { name: 'Новое поле' });
  await dialog.getByLabel('Русский').fill('Размер обуви');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Размер обуви').first()).toBeVisible();
  expect(calls.created).toHaveLength(1);
  expect(calls.created[0]).toMatchObject({ key: 'razmer_obuvi', type: 'text' });
});
