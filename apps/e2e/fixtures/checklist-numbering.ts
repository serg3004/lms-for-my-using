import { expect, type Page } from '@playwright/test';
import { openPreviewBuilder, previewSheet } from './checklist-preview.js';

export async function openNumberingEditor(page: Page, locale = 'ru') {
  const sheet = previewSheet();
  sheet.items = sheet.items.slice(0, 2).map((item, index) => ({ ...item, text: index ? 'Criterion B' : '7. Author criterion', photoRequired: false }));
  sheet.contextFields = []; sheet.feedbackEnabled = false;
  sheet.itemGroups = sheet.itemGroups!.slice(0, 1).map((group) => ({ ...group, title: '9. Author group' }));
  await openPreviewBuilder(page, sheet, locale);
  let saved: Record<string, unknown> | undefined;
  await page.route(`**/api/v1/checklists/${sheet.id}`, (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    saved = route.request().postDataJSON(); Object.assign(sheet, saved); return route.fulfill({ json: sheet });
  });
  return { sheet, saved: () => saved };
}

export async function openUnnumberedPreview(page: Page) {
  const data = await openNumberingEditor(page);
  await page.getByRole('checkbox', { name: 'Нумерация критериев и групп', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: data.sheet.title, exact: true });
  await expect(dialog.getByRole('heading', { name: '9. Author group', exact: true })).toBeVisible();
  await expect(dialog.getByRole('radiogroup', { name: '7. Author criterion', exact: true })).toBeVisible();
  return { ...data, dialog };
}
