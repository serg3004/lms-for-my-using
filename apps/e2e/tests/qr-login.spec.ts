import { expect, test } from '@playwright/test';

import { qrCode, installQrMocks, newQrState } from '../fixtures/qr-login.js';

test('PR 505: a device shows a QR, the phone confirms, and the device is let in once', async ({ browser }) => {
  const state = newQrState();
  const device = await (await browser.newContext()).newPage();
  const phone = await (await browser.newContext()).newPage();
  await installQrMocks(device, state);
  await installQrMocks(phone, state);

  await device.goto('/login');
  await device.getByRole('button', { name: 'По QR', exact: true }).click();
  await expect(device.getByRole('img', { name: 'QR-код для входа' })).toBeVisible();
  await expect(device.getByText('Ждём подтверждения на телефоне…')).toBeVisible();
  // The code is in the picture only: nothing on the screen prints it.
  await expect(device.getByText(qrCode)).toHaveCount(0);

  await phone.goto(`/qr-login#${qrCode}`);
  await expect(phone.getByText('Chrome · Windows')).toBeVisible();
  await expect(phone.getByText('203.0.x.x')).toBeVisible();
  expect(state.approved).toHaveLength(0);
  await phone.getByRole('button', { name: 'Подтвердить вход' }).click();
  await expect(phone.getByText('Вход подтверждён.')).toBeVisible();

  await expect.poll(() => state.delivered, { timeout: 10_000 }).toBe(true);
  expect(state.approved).toEqual([qrCode]);
  await device.context().close();
  await phone.context().close();
});

test('PR 505: declining on the phone is shown on the device, which asks for a new code', async ({ browser }) => {
  const state = newQrState();
  const device = await (await browser.newContext()).newPage();
  const phone = await (await browser.newContext()).newPage();
  await installQrMocks(device, state);
  await installQrMocks(phone, state);

  await device.goto('/login');
  await device.getByRole('button', { name: 'По QR', exact: true }).click();
  await expect(device.getByRole('img', { name: 'QR-код для входа' })).toBeVisible();

  await phone.goto(`/qr-login#${qrCode}`);
  await phone.getByRole('button', { name: 'Это не я' }).click();
  await expect(phone.getByText('Вход отклонён.')).toBeVisible();
  await expect(device.getByText('Вход отклонён на телефоне.')).toBeVisible();
  expect(state.delivered).toBe(false);

  state.decision = 'pending';
  const before = state.starts;
  await device.getByRole('button', { name: 'Новый код' }).click();
  await expect.poll(() => state.starts).toBe(before + 1);
  await device.context().close();
  await phone.context().close();
});

test('PR 505: a phone that is not signed in, or whose role is not allowed, is told what to do', async ({ browser }) => {
  const state = newQrState();
  const phone = await (await browser.newContext()).newPage();
  await installQrMocks(phone, state);

  state.phoneSignedIn = false;
  await phone.goto(`/qr-login#${qrCode}`);
  await expect(phone.getByText('Сначала войдите в систему на этом телефоне')).toBeVisible();
  await expect(phone.getByRole('link', { name: 'Перейти ко входу' })).toHaveAttribute('href', '/login');

  state.phoneSignedIn = true;
  state.phoneAllowed = false;
  await phone.reload();
  await phone.getByRole('button', { name: 'Подтвердить вход' }).click();
  await expect(phone.getByText('Вход по QR для вашей роли не разрешён.')).toBeVisible();
  expect(state.approved).toHaveLength(0);

  await phone.goto('/qr-login#' + 'X'.repeat(43));
  await phone.reload();
  await expect(phone.getByText('Код недействителен или устарел.')).toBeVisible();
  await phone.context().close();
});
