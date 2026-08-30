import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/isolated-test.js';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('input[name="organizationId"]').fill('demo-company');
  await page.locator('input[name="email"]').fill('admin@demo.com');
  await page.locator('input[name="password"]').fill('Demo1234!');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function createLearner(page: Page, email: string) {
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Создать пользователя' }).click();
  const dialog = page.getByRole('dialog', { name: 'Создать пользователя' });
  await dialog.getByLabel('Фамилия').fill('Manager');
  await dialog.getByLabel('Имя').fill('Candidate');
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Пароль').fill('Temporary123!');
  await dialog.getByLabel('Роль', { exact: true }).selectOption('learner');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(dialog).not.toBeVisible();
}

test('admin assigns a primary DIRECT manager, sees it in the tree and editor, then closes it', async ({ page }, testInfo) => {
  const suffix = `${testInfo.workerIndex}-${Date.now()}`;
  const email = `e2e-manager-${suffix}@example.invalid`;
  const deptName = `E2E Managed Dept ${suffix}`;

  await loginAsAdmin(page);
  await createLearner(page, email);

  await page.goto('/admin/departments');
  await page.getByRole('button', { name: /Добавить корневое подразделение/ }).click();
  const createDialog = page.getByRole('dialog').filter({ hasText: 'Добавить корневое подразделение' });
  await createDialog.getByLabel('Название').fill(deptName);
  await createDialog.getByRole('button', { name: 'Создать' }).click();
  await expect(createDialog).not.toBeVisible();

  const tree = page.getByRole('tree', { name: 'Дерево подразделений' });
  const item = tree.getByRole('treeitem', { name: new RegExp(deptName) });
  await item.click();

  const detail = page.getByRole('article').filter({ hasText: deptName });
  const directSection = detail.locator('.admin-membership-section').filter({ hasText: 'Прямой' });
  await directSection.locator('input[type="search"]').fill(email);
  await directSection.locator('select').selectOption({ label: 'Candidate Manager' });
  await directSection.getByRole('button', { name: 'Добавить' }).click();

  await expect(directSection.getByText('Candidate Manager')).toBeVisible();

  // The tree badge shows the primary manager's name once the effective set is fetched.
  await expect(item.getByText('Candidate Manager', { exact: false })).toBeVisible();

  await directSection.getByRole('button', { name: 'Закрыть' }).click();
  await expect(directSection.getByText('Руководители не назначены.')).toBeVisible();
});

test('admin manages department users: adds an additional membership and transfers it', async ({ page }, testInfo) => {
  const suffix = `${testInfo.workerIndex}-${Date.now()}`;
  const email = `e2e-member-${suffix}@example.invalid`;
  const fromName = `E2E From ${suffix}`;
  const toName = `E2E To ${suffix}`;

  await loginAsAdmin(page);
  await createLearner(page, email);

  await page.goto('/admin/departments');
  for (const name of [fromName, toName]) {
    await page.getByRole('button', { name: /Добавить корневое подразделение/ }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Добавить корневое подразделение' });
    await dialog.getByLabel('Название').fill(name);
    await dialog.getByRole('button', { name: 'Создать' }).click();
    await expect(dialog).not.toBeVisible();
  }

  const tree = page.getByRole('tree', { name: 'Дерево подразделений' });
  await tree.getByRole('treeitem', { name: new RegExp(fromName) }).click();
  await page.getByRole('link', { name: 'Сотрудники' }).click();
  await expect(page).toHaveURL(/\/admin\/departments\/.+\/users$/);
  await expect(page.getByRole('heading', { name: fromName })).toBeVisible();

  await page.locator('.admin-membership-add input[type="search"]').fill(email);
  await page.locator('.admin-membership-add select').selectOption({ label: 'Candidate Manager' });
  // Checked so the row is a PRIMARY membership -- Transfer only appears on primary rows (it moves
  // a user's primary department, which would be misleading to offer on an additional membership).
  await page.locator('.admin-membership-add input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Добавить' }).click();

  const row = page.getByRole('row').filter({ hasText: 'Candidate Manager' });
  await expect(row).toBeVisible();
  await expect(row.getByText('Основное')).toBeVisible();

  await row.getByRole('button', { name: 'Перевести' }).click();
  const transferDialog = page.getByRole('dialog').filter({ hasText: 'Перевести' });
  await transferDialog.getByLabel('Поиск по названию или коду…').fill(toName);
  await transferDialog.locator('select').selectOption({ label: toName });
  await transferDialog.getByRole('button', { name: 'Перевести' }).click();
  await expect(transferDialog).not.toBeVisible();

  await expect(page.getByText('Нет текущих сотрудников.')).toBeVisible();
});
