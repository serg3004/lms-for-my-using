import { expect, test } from '@playwright/test';

import { badgePin, badgeToken, installBadgeMocks, newBadgeState } from '../fixtures/badge.js';

async function enterPin(page: import('@playwright/test').Page, pin: string) {
  for (const digit of pin) await page.getByRole('button', { name: `Цифра ${digit}`, exact: true }).click();
}

test('PR 506: a scanned badge and the PIN open only assigned work, and finishing returns to the scan', async ({ page }) => {
  const state = newBadgeState();
  await installBadgeMocks(page, state);
  await page.goto('/badge');
  // A scanner types the code and presses Enter.
  await page.getByLabel('Код бейджа').fill(badgeToken);
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByRole('heading', { name: 'Введите PIN' })).toBeVisible();
  expect(state.scans).toEqual([{ token: badgeToken }]);

  await enterPin(page, badgePin);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.waitForURL('**/learn');
  expect(state.scans[1]).toEqual({ token: badgeToken, pin: badgePin });

  // The menu has only assigned work; no profile, no certificates; a large finish button.
  await expect(page.getByText('Вы вошли по бейджу', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Назначения' }).first()).toBeVisible();
  await expect(page.locator('a[href="/profile"]')).toHaveCount(0);
  await expect(page.locator('a[href="/learn/certificates"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Закончить работу' }).click();
  await page.waitForURL('**/badge');
  expect(state.loggedOut).toBe(true);
});

test('PR 506: a wrong PIN gets one answer and stays on the PIN screen; the token never stays in the address', async ({ page }) => {
  const state = newBadgeState();
  await installBadgeMocks(page, state);
  await page.goto(`/badge#${badgeToken}`);
  await expect(page.getByRole('heading', { name: 'Введите PIN' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');

  await enterPin(page, '1111');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Бейдж или PIN не подходят');
  await expect(page.getByRole('heading', { name: 'Введите PIN' })).toBeVisible();
  expect(state.signedIn).toBe(false);

  await page.getByRole('button', { name: 'Другой бейдж' }).click();
  await expect(page.getByLabel('Код бейджа')).toBeVisible();
  await page.getByLabel('Код бейджа').fill('not a badge');
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByRole('alert')).toContainText('Бейдж или PIN не подходят');
});

test('PR 506: when the session ends by itself, the screen returns to the badge scan', async ({ page }) => {
  const state = newBadgeState();
  await installBadgeMocks(page, state);
  await page.goto(`/badge#${badgeToken}`);
  await enterPin(page, badgePin);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.waitForURL('**/learn');
  await expect(page.getByText('Вы вошли по бейджу', { exact: false })).toBeVisible();
  await page.waitForLoadState('networkidle');

  // The work was handed in (or the badge was reported lost): the next call is refused and cannot be renewed.
  state.sessionEnded = true;
  await page.getByRole('link', { name: 'Назначения' }).first().click();
  await page.waitForURL('**/badge');
});
