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

async function fillCreateForm(page: Page, email: string, password: string) {
  const dialog = page.getByRole('dialog', { name: 'Create user' });
  await dialog.getByLabel('Last name').fill('Automation');
  await dialog.getByLabel('First name').fill('Admin user');
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Password').fill(password);
  await dialog.getByLabel('Role').selectOption('learner');
}

test('admin creates, filters, edits, deactivates and reactivates a user', async ({ page, isolatedUser }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();

  await page.getByRole('button', { name: 'Create user' }).click();
  await page.getByLabel('Password').fill('CloseMustClear123!');
  await page.getByRole('dialog', { name: 'Create user' }).getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Create user' }).click();
  await expect(page.getByLabel('Password')).toHaveValue('');
  await fillCreateForm(page, 'admin@demo.com', 'Temporary123!');
  await page.getByRole('dialog', { name: 'Create user' }).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('A user with this email already exists')).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveValue('');

  await page.getByLabel('Email').fill(isolatedUser.email);
  await page.getByLabel('Password').fill('Temporary123!');
  await page.getByRole('dialog', { name: 'Create user' }).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog', { name: 'Create user' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Create user' }).click();
  await expect(page.getByLabel('Password')).toHaveValue('');
  await page.getByRole('dialog', { name: 'Create user' }).getByRole('button', { name: 'Cancel' }).click();

  await page.getByLabel('Search users').fill(isolatedUser.email);
  const row = page.getByRole('row').filter({ hasText: isolatedUser.email });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Edit' }).click();
  const editDialog = page.getByRole('dialog', { name: 'Edit user' });
  await editDialog.getByLabel('First name').fill('Updated admin user');
  await editDialog.getByRole('button', { name: 'Save' }).click();
  await expect(editDialog).not.toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Updated admin user' })).toBeVisible();

  await row.getByRole('button', { name: 'Deactivate' }).click();
  await expect(row.getByText('suspended')).toBeVisible();
  await row.getByRole('button', { name: 'Activate' }).click();
  await expect(row.getByText('active')).toBeVisible();
});
