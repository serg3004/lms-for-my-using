import { expect, test } from '@playwright/test';
import { scaleLibraryServer } from '../fixtures/scale-library.js';

test('standalone scale creation and editing return to the live list without a document reload', async ({ page }) => {
  const server = scaleLibraryServer(); await server.attach(page); let reloads = 0; page.on('load', () => reloads++);
  await page.getByRole('link', { name: 'Новая шкала', exact: true }).click();
  await page.getByLabel('Название шкалы', { exact: true }).fill('Безопасность');
  await page.getByLabel('Название уровня 1', { exact: true }).fill('Нет'); await page.getByLabel('Название уровня 2', { exact: true }).fill('Да');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page).toHaveURL(/\/scales$/); await expect(page.getByRole('status')).toContainText('Изменения оценочных шкал сохранены');
  await page.getByRole('link', { name: /Безопасность/ }).click(); await page.getByLabel('Баллы уровня 2', { exact: true }).fill('80');
  await expect(page.getByRole('region', { name: 'Предпросмотр', exact: true })).toContainText('80');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await expect(page).toHaveURL(/\/scales$/);
  expect(server.writes.map(({ method }) => method)).toEqual(['POST', 'PATCH']); expect(reloads).toBe(0);
});

test('search, sort, usage and author metadata; used scales show the edit policy and cannot be deleted', async ({ page }) => {
  const server = scaleLibraryServer(); await server.attach(page);
  await page.getByRole('combobox', { name: 'Сортировка по названию' }).selectOption('desc'); await expect(page.locator('ul.admin-checklist-instances > li > a').first()).toContainText('Навыки');
  await page.getByRole('searchbox').fill('Качество'); await expect(page.getByRole('link', { name: /Анна Автор/ })).toHaveCount(1);
  await page.getByRole('link', { name: /Качество обслуживания/ }).click();
  await expect(page.getByRole('note').filter({ hasText: 'ещё не начаты' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Открытие смены', exact: true })).toHaveAttribute('href', '/admin/checklists?checklistId=sheet');
  await page.getByRole('button', { name: 'Удалить', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('не может быть удалена'); await expect(page.getByRole('link', { name: 'Открытие смены', exact: true })).toBeVisible();
  expect(server.scales.some(({ id }) => id === 'quality')).toBe(true);
});

test('protected scale is read only and can be copied; the copy can be archived and deleted', async ({ page }) => {
  const server = scaleLibraryServer(); await server.attach(page, '/system');
  await expect(page.getByLabel('Название шкалы', { exact: true })).toBeDisabled(); await expect(page.getByRole('button', { name: 'Удалить', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Сделать копию', exact: true }).click(); await expect(page).toHaveURL(/\/scales\/copy-/);
  await expect(page.getByLabel('Название шкалы', { exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'В архив', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'В архив', exact: true }).click();
  await page.getByRole('link', { name: /Да \/ Нет.*копия/ }).click(); await expect(page.getByLabel('Название шкалы', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Удалить', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page).toHaveURL(/\/scales$/); expect(server.scales).toHaveLength(3);
});

for (const role of ['instructor', 'mentor'] as const) test(`${role} views the scale library without write controls`, async ({ page }) => {
  const server = scaleLibraryServer({ role }); await server.attach(page);
  await expect(page.getByRole('link', { name: 'Новая шкала', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: /Качество обслуживания/ }).click(); await expect(page.getByLabel('Название шкалы', { exact: true })).toBeDisabled();
  for (const name of ['Сохранить', 'Сделать копию', 'В архив', 'Удалить']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  expect(server.writes).toHaveLength(0);
});

test('failed saves retain the draft; missing and empty states remain distinct', async ({ page }) => {
  const server = scaleLibraryServer(); await server.attach(page, '/unused');
  await page.getByLabel('Название шкалы', { exact: true }).fill('Сохранить этот черновик'); server.fail(500);
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByLabel('Название шкалы', { exact: true })).toHaveValue('Сохранить этот черновик');
  await page.goto(`${server.base}/missing`); await expect(page.getByRole('alert')).toContainText('не найдена');
});
for (const locale of ['ru', 'en', 'kk', 'zh'] as const) test(`${locale}: empty list and narrow keyboard editor are localized`, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 }); const server = scaleLibraryServer({ locale, empty: true }); await server.attach(page);
  await expect(page.locator('main')).not.toContainText('admin.checklists.');
  await page.goto(`${server.base}/new`); const name = page.locator('input[maxlength="255"]'); await expect(name).toBeVisible(); await name.focus(); await page.keyboard.press('Tab'); await expect(page.locator('input[maxlength="80"]').first()).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a server permission denial is shown without a create action', async ({ page }) => {
  const server = scaleLibraryServer(); server.fail(403, 10); await server.attach(page);
  await expect(page.getByRole('alert')).toContainText('нет доступа'); await expect(page.getByRole('link', { name: 'Новая шкала', exact: true })).toHaveCount(0);
});
