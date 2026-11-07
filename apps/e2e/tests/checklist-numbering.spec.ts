import { expect, test } from '@playwright/test';
import { openNumberingEditor, openUnnumberedPreview } from '../fixtures/checklist-numbering.js';
import { openSettingsTab } from '../fixtures/checklist-settings-tab.js';

for (const width of [320, 390]) test(`numbering setting saves, hides generated prefixes and restores defaults at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  const { dialog, saved } = await openUnnumberedPreview(page);
  await expect(dialog.getByRole('radiogroup', { name: 'Criterion B', exact: true })).toBeVisible();
  await expect.poll(() => dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).last().click();
  // Preview saves pending settings through the existing shared transaction (PR 417).
  await expect.poll(() => saved()?.showNumbering).toBe(false);
  await openSettingsTab(page);
  await page.getByRole('checkbox', { name: 'Нумерация критериев и групп', exact: true }).check();
  await page.getByRole('button', { name: 'Сохранить', exact: true }).first().click();
  await expect.poll(() => saved()?.showNumbering).toBe(true);
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: '1 9. Author group', exact: true })).toBeVisible();
  await expect(dialog.getByRole('radiogroup', { name: '1.1 7. Author criterion', exact: true })).toBeVisible();
});

for (const [locale, label] of [['en', 'Number criteria and groups'], ['kk', 'Критерийлер мен топтарды нөмірлеу'], ['zh', '为标准和分组编号']]) test(`numbering defaults on in ${locale}`, async ({ page }) => {
  await openNumberingEditor(page, locale);
  await openSettingsTab(page);
  await expect(page.getByRole('checkbox', { name: label, exact: true })).toBeChecked();
});
