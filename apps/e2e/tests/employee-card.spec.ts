import { expect, test } from '@playwright/test';

import { badgeToken, installEmployeeCardMocks } from '../fixtures/employee-card.js';

test('PR 507: a signed-in colleague scans a badge and sees the blocks the admin allows, and can mark the check', async ({ page }) => {
  const calls = await installEmployeeCardMocks(page, 'peer');
  await page.goto(`/employee-card#${badgeToken}`);
  await expect(page.getByRole('heading', { name: 'Айгуль Каримова' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.getByText('Охрана труда', { exact: false })).toBeVisible();
  await expect(page.getByText('Санитарная книжка', { exact: false })).toBeVisible();
  await expect(page.getByText('Открытие смены', { exact: false })).toBeVisible();
  expect(new Set(calls.opened)).toEqual(new Set([badgeToken]));
  await page.getByRole('button', { name: 'Отметить как проверенную' }).click();
  await expect(page.getByRole('status').last()).toBeVisible();
  expect(new Set(calls.checked)).toEqual(new Set([badgeToken]));
});

test('PR 507: an unknown visitor gets only a warning, and the scan is logged', async ({ page }) => {
  const calls = await installEmployeeCardMocks(page, 'anonymous');
  await page.goto(`/employee-card#${badgeToken}`);
  await expect(page.getByRole('alert')).toContainText('Ай-ай-ай');
  await expect(page.getByText('Айгуль')).toHaveCount(0);
  expect(new Set(calls.anonymous)).toEqual(new Set([badgeToken]));
  await expect(page.getByRole('link', { name: 'Войти' })).toBeVisible();
});

test('PR 507: an outside inspector sees only the pass', async ({ page }) => {
  await installEmployeeCardMocks(page, 'inspector');
  await page.goto(`/employee-card#${badgeToken}`);
  await expect(page.getByRole('heading', { name: 'Айгуль Каримова' })).toBeVisible();
  await expect(page.getByText('Охрана труда')).toHaveCount(0);
});

test('PR 507: a signed-in person who opens a badge link goes to the card, not to the PIN screen', async ({ page }) => {
  const calls = await installEmployeeCardMocks(page, 'peer');
  await page.goto(`/badge#${badgeToken}`);
  await expect(page).toHaveURL(/\/employee-card$/);
  await expect(page.getByRole('heading', { name: 'Айгуль Каримова' })).toBeVisible();
  expect(new Set(calls.opened)).toEqual(new Set([badgeToken]));
});
