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

test('PR 505: an administrator switches sign-in by QR on and chooses the roles and the term', async ({ page }) => {
  const calls = await installLoginProtectionMocks(page);
  await page.goto('/admin/security');
  await expect(page.getByRole('heading', { name: 'Вход по QR-коду' })).toBeVisible();
  await page.getByLabel('Разрешить вход по QR в организации').check();
  await page.getByLabel('Срок сеанса по QR, часов').fill('4');
  await page.getByRole('checkbox', { name: 'Администратор' }).check();
  await expect(page.getByText('лучше не включать')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Администратор' }).uncheck();
  await page.locator('form', { has: page.getByRole('heading', { name: 'Вход по QR-коду' }) }).getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Настройки входа по QR сохранены.')).toBeVisible();
  expect(calls.qrSaved).toEqual([{ enabled: true, sessionHours: 4, roles: ['learner', 'mentor', 'instructor'] }]);
});
