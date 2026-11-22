import { expect, test } from '@playwright/test';

import { installUserProfileMocks } from '../fixtures/user-profile.js';

const photo = { name: 'me.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') };

test('PR 496: the person edits phone, time zone and the note, and sets and removes a photo', async ({ page }) => {
  const calls = await installUserProfileMocks(page);
  await page.goto('/profile');
  const card = page.getByRole('region', { name: 'О себе' });
  await expect(card).toBeVisible();
  await expect(card.getByText('ФИО, почту, должность, смену и роль меняет администратор или руководитель.')).toBeVisible();

  await card.getByLabel('Телефон').fill('позвоните мне');
  await card.getByRole('button', { name: 'Сохранить' }).click();
  await expect(card.getByText('Введите номер цифрами')).toBeVisible();
  expect(calls.patches).toHaveLength(0);

  await card.getByLabel('Телефон').fill('+7 701 123 45 67');
  await card.getByLabel('О себе', { exact: true }).fill('Кладовщик склада №2');
  await card.getByRole('button', { name: 'Сохранить' }).click();
  await expect(card.getByText('Профиль сохранён.')).toBeVisible();
  expect(calls.patches).toEqual([{ version: 0, phone: '+7 701 123 45 67', timezone: 'Asia/Almaty', aboutMe: 'Кладовщик склада №2' }]);

  await card.getByLabel('Фото').setInputFiles(photo);
  await expect(card.getByRole('img', { name: 'Ваше фото' })).toBeVisible();
  expect(calls.uploads).toBe(1);
  await card.getByRole('button', { name: 'Удалить фото' }).click();
  await expect(card.getByRole('img', { name: 'Ваше фото' })).toHaveCount(0);
  expect(calls.removals).toBe(1);
});

test('PR 496: a change made elsewhere is reloaded and explained, then saving works', async ({ page }) => {
  const calls = await installUserProfileMocks(page, { conflictOnce: true });
  await page.goto('/profile');
  const card = page.getByRole('region', { name: 'О себе' });
  await card.getByLabel('О себе', { exact: true }).fill('Моя версия');
  await card.getByRole('button', { name: 'Сохранить' }).click();
  await expect(card.getByText('Профиль изменили в другом месте')).toBeVisible();
  await expect(card.getByLabel('О себе', { exact: true })).toHaveValue('Изменено в другой вкладке');

  await card.getByLabel('О себе', { exact: true }).fill('Моя версия');
  await card.getByRole('button', { name: 'Сохранить' }).click();
  await expect(card.getByText('Профиль сохранён.')).toBeVisible();
  expect(calls.patches.map((patch) => patch.version)).toEqual([0, 1]);
});

test('PR 496: the old learner profile address leads to the common profile screen', async ({ page }) => {
  await installUserProfileMocks(page);
  await page.goto('/learn/profile');
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('region', { name: 'О себе' })).toBeVisible();
});
