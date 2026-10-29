import { expect, test } from '@playwright/test';
import { importChecklistId, importObserver, openSessionImport } from '../fixtures/session-employee-import.js';

for (const role of ['admin', 'manager', 'instructor', 'mentor'] as const) {
  test(`${role} previews an employee file, configures common sessions and sees the row report`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    const writes = await openSessionImport(page, role);
    const dialog = page.getByRole('dialog', { name: 'Импорт списка', exact: true });
    await dialog.getByLabel('Файл CSV или Excel', { exact: true }).setInputFiles({ name: 'employees.csv', mimeType: 'text/csv', buffer: Buffer.from('email\nalex@example.test\noutside@example.test\nalex@example.test\n=2+2') });
    await dialog.getByRole('button', { name: 'Проверить список', exact: true }).click();
    await expect(dialog.getByRole('region', { name: 'Отчёт по строкам импорта' })).toContainText('Принято: 1; пропущено: 3.');
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe('/checklist-sessions/import/preview');
    if (role !== 'instructor') await dialog.getByRole('radio', { name: /Olga Observer/ }).click();
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click();
    await dialog.getByRole('radio', { name: /Import checklist/ }).check();
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click();
    await expect(dialog.getByRole('radio', { name: 'Для каждой отдельно', exact: true })).toHaveCount(0);
    await dialog.getByRole('radio', { name: /Запланировать/ }).check();
    await dialog.getByLabel('Дата и время', { exact: true }).fill('2026-11-10T10:00');
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click();
    await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
    const report = dialog.getByRole('region', { name: 'Отчёт по строкам импорта' });
    await expect(report).toContainText('Сессия создана');
    await expect(report).toContainText('вне вашей зоны');
    await expect(report).toContainText('Повтор email');
    expect(writes).toHaveLength(2);
    expect(writes[1].data).toContain(importChecklistId);
    expect(writes[1].data).toContain(importObserver.id);
    expect(writes[1].data).toContain('operationId');
    expect(writes[1].data).not.toContain('learnerIds');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test('replacing the file invalidates the preview, and file errors are localized', async ({ page }) => {
  const writes = await openSessionImport(page, 'admin');
  const dialog = page.getByRole('dialog', { name: 'Импорт списка', exact: true });
  await dialog.getByRole('radio', { name: /Olga Observer/ }).click();
  const file = dialog.getByLabel('Файл CSV или Excel', { exact: true });
  await file.setInputFiles({ name: 'first.csv', mimeType: 'text/csv', buffer: Buffer.from('email\nalex@example.test') });
  await dialog.getByRole('button', { name: 'Проверить список', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Далее', exact: true })).toBeEnabled();
  await file.setInputFiles({ name: 'wrong.csv', mimeType: 'text/csv', buffer: Buffer.from('name\nAlex') });
  await expect(dialog.getByRole('button', { name: 'Далее', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('region', { name: 'Отчёт по строкам импорта' })).toHaveCount(0);
  await page.route('**/api/v1/checklist-sessions/import/preview', (route) => route.fulfill({ status: 400, json: { message: 'session_import.header' } }));
  await dialog.getByRole('button', { name: 'Проверить список', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('одна колонка');
  await file.setInputFiles({ name: 'large.csv', mimeType: 'text/csv', buffer: Buffer.alloc(1024 * 1024 + 1) });
  await expect(dialog.getByRole('alert')).toContainText('1 МБ');
  await expect(dialog.getByRole('button', { name: 'Проверить список', exact: true })).toBeDisabled();
  expect(writes).toHaveLength(1);
});
