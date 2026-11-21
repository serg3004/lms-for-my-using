import { expect, test } from '@playwright/test';

import { installLoginProtectionMocks } from '../fixtures/login-protection.js';

test('PR 493: the administrator changes the sign-in limits and lifts a lock', async ({ page }) => {
  const calls = await installLoginProtectionMocks(page);
  await page.goto('/admin/security');
  await expect(page.getByRole('heading', { name: 'Защита входа' })).toBeVisible();
  await expect(page.getByLabel('Неверных паролей до блокировки (3–20)')).toHaveValue('5');

  await page.getByLabel('Неверных паролей до блокировки (3–20)').fill('8');
  await page.getByLabel('Блокировать на (минут, 1–1440)').fill('30');
  await page.getByRole('button', { name: 'Сохранить пределы' }).click();
  await expect(page.getByText('Пределы сохранены.')).toBeVisible();
  expect(calls.saved).toEqual([{ maxFailures: 8, windowMinutes: 15, lockMinutes: 30, logRetentionDays: 90 }]);

  await expect(page.getByText('Сергеева Айгуль')).toBeVisible();
  await page.getByRole('button', { name: 'Разблокировать' }).click();
  await expect(page.getByText('Сейчас никто не заблокирован.')).toBeVisible();
  expect(calls.unlocked).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1']);
});
