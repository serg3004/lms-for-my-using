import { expect, type Page } from '@playwright/test';
import { openNumberingEditor } from './checklist-numbering.js';

export async function openResultEditor(page: Page, locale = 'ru') {
  return openNumberingEditor(page, locale);
}
export async function finishResultPreview(page: Page) {
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '5S — рабочее место', exact: true });
  const result = dialog.getByTestId('preview-finish-result');
  await expect(result).toHaveCount(0);
  for (const radio of await dialog.getByRole('radio', { name: 'Выполнено', exact: true }).all()) await radio.check();
  await expect(result).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(result).toBeVisible();
  return { dialog, result };
}
export async function openCompletedResultPreview(page: Page, points = false) {
  const data = await openResultEditor(page);
  const toggle = page.getByRole('checkbox', { name: 'Показывать сотруднику баллы', exact: true });
  await expect(toggle).not.toBeChecked();
  if (points) await toggle.check();
  return { ...data, ...(await finishResultPreview(page)) };
}
