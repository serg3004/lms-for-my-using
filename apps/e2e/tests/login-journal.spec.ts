import { expect, test } from '@playwright/test';

import { installLoginJournalMocks, journalUserId } from '../fixtures/login-journal.js';

test('PR 494: the person sees their devices, ends another one and signs out everywhere', async ({ page }) => {
  const calls = await installLoginJournalMocks(page);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Мои устройства' })).toBeVisible();
  await expect(page.getByText('Chrome · Windows (это устройство), 203.0.x.x')).toBeVisible();
  await expect(page.getByText('Safari · iOS')).toBeVisible();
  // Only the other device has an "end session" button.
  await expect(page.getByRole('button', { name: 'Завершить сеанс' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Завершить сеанс' }).click();
  await expect(page.getByText('Safari · iOS')).toHaveCount(0);
  expect(calls.ownRevoked).toEqual(['dddddddd-dddd-4ddd-8ddd-dddddddddddd']);

  await page.route('**/login', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>login</h1>' }));
  await page.getByRole('button', { name: 'Выйти везде' }).click();
  await expect.poll(() => calls.loggedOutEverywhere).toBe(1);
});

test('PR 494: the administrator reads the sign-in journal of a person and ends their sessions', async ({ page }) => {
  const calls = await installLoginJournalMocks(page, ['admin']);
  await page.goto(`/admin/users/${journalUserId}/logins`);
  await expect(page.getByRole('heading', { name: 'Журнал входов', level: 1 })).toBeVisible();
  await expect(page.getByText('вход выполнен')).toBeVisible();
  await expect(page.getByText('неверный пароль', { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Завершить сеанс' }).click();
  await expect(page.getByText('Открытых сеансов нет.')).toBeVisible();
  expect(calls.userRevoked).toEqual(['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1']);
});
