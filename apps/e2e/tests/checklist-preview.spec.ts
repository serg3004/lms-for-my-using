import { expect, test } from '@playwright/test';
import { openPreviewBuilder, openSheetPreview, previewSheet } from '../fixtures/checklist-preview.js';

for (const width of [375, 1440]) {
  test(`sheet preview is local, complete and keyboard accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openPreviewBuilder(page);
    const requests: string[] = [];
    page.on('request', (request) => requests.push(`${request.method()} ${request.url()}`));
    const dialog = await openSheetPreview(page);
    await expect(dialog.getByText('Имя Фамилия / Подразделение')).toBeVisible();
    await expect(dialog.getByRole('heading', { name: '1 Подготовка рабочего места' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: '2 Порядок и безопасность' })).toHaveCount(1);
    await expect(dialog.locator('textarea')).toHaveCount(4);
    await expect(dialog.locator('input[type=date]')).toHaveCount(1);
    await expect(dialog.getByLabel('Рабочее место')).toBeVisible();
    const fieldOrder = await dialog.locator('.admin-card label').allTextContents();
    expect(fieldOrder.map((value) => value.trim())).toEqual(['Рабочее место *', 'Дата наблюдения', 'Условия наблюдения']);
    await dialog.getByLabel('Рабочее место').fill('Учебный участок');
    await dialog.getByLabel('Условия наблюдения').fill('Тест');
    await dialog.getByLabel('Дата наблюдения').fill('2026-10-29');
    const first = dialog.getByRole('radiogroup').first();
    await first.getByRole('radio').first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(first.getByRole('radio').nth(1)).toBeChecked();
    await expect(dialog.getByRole('status')).toContainText('1 / 3 (33%)');
    await expect(dialog.getByRole('status')).toContainText('Не завершено');
    await dialog.locator('input[type=file]').setInputFiles({ name: 'evidence.png', mimeType: 'image/png', buffer: Buffer.from('synthetic local photo') });
    await expect(dialog.getByText('evidence.png', { exact: true })).toBeVisible();
    const skip = dialog.getByRole('button', { name: 'Пропустить', exact: true });
    await expect(skip).toHaveCount(1);
    await skip.click();
    await expect(skip).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('radiogroup').last().getByRole('radio', { name: 'Нет', exact: false }).check();
    await expect(dialog.getByRole('status')).toContainText('1 / 6 (17%)');
    await dialog.getByLabel('Сильные стороны', { exact: true }).fill('Порядок');
    await expect.poll(() => dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    const close = dialog.getByRole('button', { name: 'Закрыть', exact: true }).last();
    await close.focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Закрыть', exact: true }).first()).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(close).toBeFocused();
    await dialog.getByRole('button', { name: 'Сбросить', exact: true }).click();
    await expect(dialog.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(dialog.getByLabel('Рабочее место')).toHaveValue('');
    await expect(dialog.getByLabel('Сильные стороны', { exact: true })).toHaveValue('');
    await expect(dialog.getByText('evidence.png', { exact: true })).toHaveCount(0);
    await first.getByRole('radio').last().check();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Предпросмотр', exact: true })).toBeFocused();
    const reopened = await openSheetPreview(page);
    await expect(reopened.getByRole('radio', { checked: true })).toHaveCount(0);
    expect(requests).toEqual([]);
  });
}

test('preview hides disabled sections, uses current settings and supports global skip', async ({ page }) => {
  const sheet = previewSheet();
  sheet.contextFields = []; sheet.feedbackEnabled = false; sheet.allowSkipAll = true;
  await openPreviewBuilder(page, sheet);
  const dialog = await openSheetPreview(page);
  await expect(dialog.getByRole('heading', { name: 'Общая информация' })).toHaveCount(0);
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Пропустить', exact: true })).toHaveCount(27);
  // All skipped criteria are completed, but have no score and cannot pass a positive threshold.
  for (const button of await dialog.getByRole('button', { name: 'Пропустить', exact: true }).all()) await button.click();
  await expect(dialog.getByRole('status')).not.toContainText('Не завершено');
  await expect(dialog.getByRole('status')).toContainText('0 / 0 (0%)');
});

test('an empty sheet cannot open a preview', async ({ page }) => {
  const sheet = previewSheet(); sheet.items = [];
  await openPreviewBuilder(page, sheet);
  const button = page.getByRole('button', { name: 'Предпросмотр', exact: true });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-describedby', 'checklist-needs-items');
  await expect(page.locator('#checklist-needs-items')).toBeVisible();
});

for (const [locale, preview, close, employee] of [
  ['en', 'Preview', 'Close', 'Sample employee'],
  ['kk', 'Алдын ала қарау', 'Жабу', 'Аты Тегі'],
  ['zh', '预览', '关闭', '姓名示例'],
]) {
  test(`preview controls are localized in ${locale}`, async ({ page }) => {
    await openPreviewBuilder(page, previewSheet(), locale);
    await page.getByRole('button', { name: preview, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '5S — рабочее место', exact: true });
    await expect(dialog.getByText(new RegExp(employee))).toBeVisible();
    await expect(dialog.getByRole('button', { name: close, exact: true })).toHaveCount(2);
  });
}

test('preview completion requires configured general information, photo and feedback', async ({ page }) => {
  const sheet = previewSheet(); sheet.items = sheet.items.slice(0, 1); sheet.feedbackRequired = true;
  await openPreviewBuilder(page, sheet);
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: sheet.title, exact: true });
  await dialog.getByRole('radio', { name: 'Выполнено', exact: false }).last().check();
  await dialog.getByLabel('Рабочее место').fill('Участок');
  await dialog.locator('input[type=file]').setInputFiles({ name: 'evidence.png', mimeType: 'image/png', buffer: Buffer.from('local photo') });
  await expect(dialog.getByRole('status')).toContainText('Не завершено');
  await dialog.getByLabel('Сильные стороны', { exact: true }).fill('Порядок');
  await dialog.getByLabel('Зоны роста', { exact: true }).fill('Маркировка');
  await expect(dialog.getByRole('status')).toContainText('Зачёт');
  await expect(dialog.getByRole('status')).toContainText('3 / 3 (100%)');
});
