import { expect, test } from '@playwright/test';

import { installIdentityMocks, knownNumber, sampleActivationQr } from '../fixtures/identity-activation.js';

test('PR 501: a person without email activates by number and name, and a wrong number shows the same neutral text', async ({ page }) => {
  const calls = await installIdentityMocks(page);
  await page.goto('/activate');
  await expect(page.getByRole('heading', { name: 'Активация учётной записи' })).toBeVisible();

  await page.getByLabel('ID или короткое имя организации').fill('demo');
  await page.getByLabel('Табельный номер').fill('99999');
  await page.getByLabel('Фамилия').fill('Каримова');
  await page.getByLabel('Имя', { exact: true }).fill('Айгуль');
  await page.getByLabel('Новый пароль').fill('Own-Pass7!');
  await page.getByLabel('Повторите пароль').fill('Own-Pass7!');
  await page.getByRole('button', { name: 'Активировать' }).click();
  await expect(page.getByText('Данные не найдены.')).toBeVisible();

  await page.getByLabel('Табельный номер').fill(knownNumber);
  await page.getByRole('button', { name: 'Активировать' }).click();
  await expect(page.getByRole('heading', { name: 'Учётная запись активирована' })).toBeVisible();
  expect(calls.activations).toHaveLength(2);
  expect(calls.activations[1]).toEqual({ organizationId: 'demo', employeeNumber: knownNumber, lastName: 'Каримова', firstName: 'Айгуль', password: 'Own-Pass7!' });
  await page.getByRole('link', { name: 'Перейти ко входу' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('PR 501: sign-in by employee number sends the number, the last name and the password, not an email', async ({ page }) => {
  const calls = await installIdentityMocks(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'По табельному номеру' }).click();
  await page.getByLabel(/ID организации|Организация/).first().fill('demo');
  await page.getByLabel('Табельный номер').fill(knownNumber);
  await page.getByLabel('Фамилия').fill('Каримова');
  await page.locator('#password').fill('Own-Pass7!');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect.poll(() => calls.logins.length).toBe(1);
  expect(calls.logins[0]).toEqual({ organizationId: 'demo', employeeNumber: knownNumber, lastName: 'Каримова', password: 'Own-Pass7!' });
  await page.getByRole('link', { name: 'Нет почты? Активировать учётную запись' }).click();
  await expect(page).toHaveURL(/\/activate$/);
});

test('PR 504: scanning a personal code pre-fills the organization and requires the employee identity', async ({ page }) => {
  const calls = await installIdentityMocks(page);
  await page.goto(`/activate#qr=personal.${sampleActivationQr.token}`);
  await expect(page.getByText('Учебная организация')).toBeVisible();
  await expect(page.getByLabel('ID или короткое имя организации')).toHaveCount(0);
  await page.getByRole('button', { name: 'Активировать' }).click();
  await expect(page.getByLabel('Табельный номер')).toHaveAttribute('aria-invalid', 'true');
  expect(calls.activations).toHaveLength(0);

  await page.getByLabel('Табельный номер').fill(knownNumber);
  await page.getByLabel('Фамилия').fill('Каримова');
  await page.getByLabel('Имя', { exact: true }).fill('Айгуль');
  await page.getByLabel('Новый пароль').fill('Own-Pass7!');
  await page.getByLabel('Повторите пароль').fill('Own-Pass7!');
  await page.getByRole('button', { name: 'Активировать' }).click();
  await expect(page.getByRole('heading', { name: 'Учётная запись активирована' })).toBeVisible();
  expect(calls.activations[0]).toMatchObject({ organizationId: 'demo', employeeNumber: knownNumber, firstName: 'Айгуль', lastName: 'Каримова', qr: sampleActivationQr });
});
