import { expect, test } from '@playwright/test';

import { installUserArchiveMocks } from '../fixtures/user-archive.js';

test('PR 495: the administrator sees the impact, archives a user and restores them', async ({ page }) => {
  const calls = await installUserArchiveMocks(page);
  await page.goto('/admin/users');
  await expect(page.getByRole('button', { name: 'Архивировать' })).toBeVisible();

  await page.getByRole('button', { name: 'Архивировать' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Незавершённые сессии наблюдения: 2');
  await expect(dialog).toContainText('единственный преподаватель: Охрана труда');
  await expect(dialog).toContainText('Открытые назначения курсов: 3');
  await dialog.getByRole('button', { name: 'Архивировать' }).click();

  await expect(page.getByRole('button', { name: 'Восстановить' })).toBeVisible();
  expect(calls.statusBodies).toEqual([{ status: 'archived', confirm: true }]);
  // An archived row offers "Восстановить", no password actions and no second archiving.
  await expect(page.getByRole('button', { name: 'Архивировать' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Сбросить пароль' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Восстановить' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Восстановить' }).click();
  await expect(page.getByRole('button', { name: 'Архивировать' })).toBeVisible();
  expect(calls.statusBodies[1]).toEqual({ status: 'active' });
});

test('PR 495: a manager is not offered archiving', async ({ page }) => {
  await installUserArchiveMocks(page, ['manager']);
  await page.goto('/admin/users');
  await expect(page.getByRole('button', { name: 'Деактивировать' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Архивировать' })).toHaveCount(0);
});
