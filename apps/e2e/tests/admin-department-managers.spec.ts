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

async function createRootDepartment(page: Page, name: string) {
  await page.getByRole('button', { name: /Добавить корневое подразделение/ }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Добавить корневое подразделение' });
  await dialog.getByLabel('Название').fill(name);
  await dialog.getByRole('button', { name: 'Создать' }).click();
  await expect(dialog).not.toBeVisible();
}

// One test, one admin login: department managers and the department users page share the same
// account-level login rate limit as every other admin-flow spec in this suite (5 logins/minute),
// so this covers both PR 273 surfaces without adding a second admin login to the shared budget.
test('admin manages department managers and department users', async ({ page }, testInfo) => {
  const suffix = `${testInfo.workerIndex}-${Date.now()}`;
  const managerEmail = `e2e-manager-${suffix}@example.invalid`;
  const memberEmail = `e2e-member-${suffix}@example.invalid`;
  const deptName = `E2E Managed Dept ${suffix}`;
  const fromName = `E2E From ${suffix}`;
  const toName = `E2E To ${suffix}`;

  await loginAsAdmin(page);
  await createLearner(page, managerEmail);
  await createLearner(page, memberEmail);

  // ── Department managers: assign a primary DIRECT manager, see it in the tree, close it ──
  await page.goto('/admin/departments');
  await createRootDepartment(page, deptName);

  const tree = page.getByRole('tree', { name: 'Дерево подразделений' });
  const item = tree.getByRole('treeitem', { name: new RegExp(deptName) });
  await item.click();

  const detail = page.getByRole('article').filter({ hasText: deptName });
  // Scoped by its own <h4>, not hasText -- the "Manager inheritance" subsection also contains
  // the word "Прямой" as a <label>, so a substring filter would match both subsections.
  const directSection = detail.locator('.admin-manager-subsection').filter({ has: page.getByRole('heading', { name: 'Прямой', level: 4 }) });
  await directSection.locator('input[type="search"]').fill(managerEmail);
  await directSection.locator('select').selectOption({ label: 'Candidate Manager' });
  await directSection.getByRole('button', { name: 'Добавить' }).click();
  await expect(directSection.getByText('Candidate Manager')).toBeVisible();

  // The tree badge shows the primary manager's name once the effective set is fetched.
  await expect(item.getByText('Candidate Manager', { exact: false })).toBeVisible();

  await directSection.getByRole('button', { name: 'Закрыть' }).click();
  await expect(directSection.getByText('Руководители не назначены.')).toBeVisible();

  // ── Department users: add an additional membership as primary and transfer it ──
  await createRootDepartment(page, fromName);
  await createRootDepartment(page, toName);

  await tree.getByRole('treeitem', { name: new RegExp(fromName) }).click();
  await page.getByRole('link', { name: 'Сотрудники' }).click();
  await expect(page).toHaveURL(/\/admin\/departments\/.+\/users$/);
  await expect(page.getByRole('heading', { name: fromName })).toBeVisible();

  await page.locator('.admin-membership-add input[type="search"]').fill(memberEmail);
  // Two <select> elements now live in .admin-membership-add (user picker, then the PR 275
  // Position picker) -- targeted by aria-label to avoid a Playwright strict-mode violation.
  await page.locator('.admin-membership-add').getByLabel('Выберите пользователя…').selectOption({ label: 'Candidate Manager' });
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
  // Two <select> elements now live in the dialog (target department, then the PR 275 Position
  // picker) -- targeted by aria-label to avoid a Playwright strict-mode violation.
  await transferDialog.getByLabel('Выберите целевое подразделение…').selectOption({ label: toName });
  await transferDialog.getByRole('button', { name: 'Перевести' }).click();
  await expect(transferDialog).not.toBeVisible();

  await expect(page.getByText('Нет текущих сотрудников.')).toBeVisible();
});
