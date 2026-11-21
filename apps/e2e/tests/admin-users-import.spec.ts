import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { importFileCsv, installUsersImportMocks } from '../fixtures/users-import.js';

test('PR 492: the template downloads, the file is checked row by row and the valid people are created with invitations', async ({ page }) => {
  const calls = await installUsersImportMocks(page);
  await page.goto('/admin/users/import');
  await expect(page.getByRole('heading', { name: 'Импорт пользователей', level: 1 })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать шаблон (.csv)' }).click();
  const template = readFileSync(await (await download).path(), 'utf8');
  expect(template).toContain('Почта,Фамилия,Имя,Отчество,Должность,Смена,Телефон,Язык,Подразделение,Роль');

  await page.getByLabel('Выберите файл').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(importFileCsv) });
  await expect(page.getByText('Строк в файле: 3.')).toBeVisible();
  await expect(page.getByText('Адрес почты неверный.')).toBeVisible();

  await page.getByRole('button', { name: 'Проверить' }).click();
  await expect(page.getByText('Готово к созданию: 1. С проблемами: 2.')).toBeVisible();
  await expect(page.getByText('Подразделение не найдено.')).toBeVisible();

  await page.getByRole('button', { name: 'Создать 1 и отправить приглашения' }).click();
  await expect(page.getByText('Создано: 1. Не создано: 2.')).toBeVisible();
  expect(calls.modes).toEqual(['validateOnly', 'create']);
  // The file is never sent with a password: the person is invited. Empty cells are not sent either.
  expect(calls.sent[1]).toEqual([{ email: 'anna@example.invalid', lastName: 'Иванова', firstName: 'Анна', department: 'Склад', role: 'Ученик' }]);

  const report = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать отчёт (.csv)' }).click();
  expect(readFileSync(await (await report).path(), 'utf8')).toContain('anna@example.invalid,создан');
});

test('PR 492: a file of another type is refused before anything is sent', async ({ page }) => {
  const calls = await installUsersImportMocks(page);
  await page.goto('/admin/users/import');
  await page.getByLabel('Выберите файл').setInputFiles({ name: 'people.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
  await expect(page.getByText('Поддерживаются только файлы .xlsx и .csv.')).toBeVisible();
  expect(calls.modes).toEqual([]);
});
