import { expect, test } from '@playwright/test';
import { freshTransferState as fresh, installTransferMocks as mock } from '../fixtures/checklist-transfer.js';

// PR 477: an unfinished self-filled check is handed over to a colleague (a relay: one executor at a time).
for (const width of [390, 1280]) {
  test.describe(`hand-over of a check at ${width}px (PR 477)`, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize({ width, height: 844 }); });

    test('the executor hands the check to a colleague and sees it as "Передано"', async ({ page }) => {
      const state = fresh();
      await mock(page, 'executor', state);
      await page.goto('/learn/checklists');
      await page.getByText('Приёмка товара').click();
      await page.getByRole('button', { name: 'Передать проверку…' }).click();
      const dialog = page.getByRole('dialog', { name: 'Передать проверку коллеге' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('После передачи вы не сможете её править.')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Передать', exact: true })).toBeDisabled();
      await dialog.getByLabel('Кому передать').selectOption('anna');
      await dialog.getByLabel('Заметка коллеге (необязательно)').fill('Склад закрывается в 18:00');
      for (const name of ['Передать', 'Отмена']) expect((await dialog.getByRole('button', { name, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await dialog.getByRole('button', { name: 'Передать', exact: true }).click();
      await expect.poll(() => state.bodies).toEqual([{ toUserId: 'anna', note: 'Склад закрывается в 18:00', expectedUpdatedAt: '2026-11-19T09:00:00.000Z' }]);
      const handed = page.locator('[aria-labelledby="transferred-title"]');
      await expect(handed.getByText('Передано коллегам')).toBeVisible();
      await expect(handed.getByText('Передано: Иванова Анна')).toBeVisible();
      await expect(handed.getByRole('button')).toHaveCount(0);
      await expect(page.getByText('Передать проверку…')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    test('is reachable and closable with the keyboard', async ({ page }) => {
      await mock(page, 'executor', fresh());
      await page.goto('/learn/checklists');
      await page.getByText('Приёмка товара').click();
      const open = page.getByRole('button', { name: 'Передать проверку…' });
      await open.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Передать проверку коллеге' });
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(open).toBeFocused();
    });

    test('says there is nobody to hand over to', async ({ page }) => {
      const state = fresh();
      state.candidates = [];
      await mock(page, 'executor', state);
      await page.goto('/learn/checklists');
      await page.getByText('Приёмка товара').click();
      await page.getByRole('button', { name: 'Передать проверку…' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Нет доступных коллег: проверку можно передать только сотруднику того же подразделения.')).toBeVisible();
      await expect(dialog.getByRole('combobox')).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: 'Передать', exact: true })).toBeDisabled();
    });

    test('shows a conflict when the check changed meanwhile and keeps it with the executor', async ({ page }) => {
      const state = fresh();
      state.transferStatus = 409;
      await mock(page, 'executor', state);
      await page.goto('/learn/checklists');
      await page.getByText('Приёмка товара').click();
      await page.getByRole('button', { name: 'Передать проверку…' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Кому передать').selectOption('boris');
      await dialog.getByRole('button', { name: 'Передать', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('Проверка изменилась. Обновите страницу и попробуйте снова.');
      await expect(dialog.getByRole('button', { name: 'Обновить' })).toBeVisible();
      await expect(page.locator('[aria-labelledby="transferred-title"]')).toHaveCount(0);
    });

    test('the colleague finds the check, reads the history with the note and can answer it', async ({ page }) => {
      const state = fresh();
      state.transferred = true;
      await mock(page, 'colleague', state);
      await page.goto('/learn/checklists');
      await page.getByText('Приёмка товара').click();
      const history = page.getByRole('region', { name: 'История передач' });
      await expect(history).toContainText('Лернер Лена → Иванова Анна');
      await expect(history).toContainText('Заметка: Склад закрывается в 18:00');
      await expect(page.getByRole('radio', { name: 'Да', exact: true })).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Передать проверку…' })).toBeVisible();
    });
  });
}
