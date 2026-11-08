import { fillRich } from '../fixtures/rich-fill.js';
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
    await expect(dialog.locator('[role=textbox]')).toHaveCount(4);
    await expect(dialog.locator('input[type=date]')).toHaveCount(1);
    await expect(dialog.getByLabel('Рабочее место')).toBeVisible();
    const fieldOrder = await dialog.locator('.admin-card > * > span:first-child').allTextContents();
    expect(fieldOrder.map((value) => value.trim())).toEqual(['Рабочее место *', 'Дата наблюдения', 'Условия наблюдения']);
    await dialog.getByLabel('Рабочее место').fill('Учебный участок');
    await fillRich(page, dialog.getByLabel('Условия наблюдения'), 'Тест');
    await dialog.getByLabel('Дата наблюдения').fill('2026-10-29');
    const first = dialog.getByRole('radiogroup').first();
    await first.getByRole('radio').first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(first.getByRole('radio').nth(1)).toBeChecked();
    await expect(dialog.getByRole('status')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Завершить', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Лист пока нельзя завершить');
    await dialog.locator('input[type=file]').setInputFiles({ name: 'evidence.png', mimeType: 'image/png', buffer: Buffer.from('synthetic local photo') });
    await expect(dialog.getByText('evidence.png', { exact: true })).toBeVisible();
    const skip = dialog.getByRole('button', { name: 'Пропустить', exact: true });
    await expect(skip).toHaveCount(1);
    await skip.click();
    await expect(skip).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('radiogroup').last().getByRole('radio', { name: 'Нет', exact: false }).check();
    await fillRich(page, dialog.getByLabel('Сильные стороны', { exact: true }), 'Порядок');
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
    await expect(dialog.getByLabel('Сильные стороны', { exact: true })).toHaveText('');
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
  await dialog.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('status')).toContainText('Лист завершён');
  await expect(dialog.getByRole('status')).toContainText('0%');
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
  await dialog.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Структурированная обратная связь');
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await fillRich(page, dialog.getByLabel('Сильные стороны', { exact: true }), 'Порядок');
  await fillRich(page, dialog.getByLabel('Зоны роста', { exact: true }), 'Маркировка');
  await expect(dialog.getByRole('status')).toContainText('Лист завершён');
  await expect(dialog.getByRole('status')).toContainText('Зачтено');
  await expect(dialog.getByRole('status')).toContainText('100%');
});

for (const width of [320, 390]) test(`Finish, Reset and Close fit the preview footer at ${width}px and Reset clears the result`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  const sheet = previewSheet(); sheet.contextFields = []; sheet.feedbackEnabled = false;
  await openPreviewBuilder(page, sheet);
  const dialog = await openSheetPreview(page);
  const footer = dialog.locator('footer');
  for (const name of ['Завершить', 'Сбросить', 'Закрыть']) await expect(footer.getByRole('button', { name, exact: true })).toBeVisible();
  await footer.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByRole('alert').getByRole('button').first().click();
  await expect(dialog.getByRole('radiogroup').first().getByRole('radio').first()).toBeFocused();
  await expect.poll(() => dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await footer.getByRole('button', { name: 'Сбросить', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

for (const width of [320, 390]) test(`an answer is painted with its level colour, can be taken back, and options are at least 44px at ${width}px (PR 425)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  const sheet = previewSheet(); sheet.contextFields = []; sheet.feedbackEnabled = false;
  await openPreviewBuilder(page, sheet);
  const dialog = await openSheetPreview(page);
  const group = dialog.getByRole('radiogroup').first();
  // The first criterion has a scale without owner colours: the colour follows the score (0 red, between orange, best green).
  const none = group.getByRole('radio').first();
  const noneOption = group.locator('label').first();
  const partial = group.getByRole('radio').nth(1);
  const partialOption = group.locator('label').nth(1);
  const full = group.getByRole('radio').nth(2);
  const fullOption = group.locator('label').nth(2);
  for (const option of [noneOption, partialOption, fullOption]) expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await none.click();
  await expect(noneOption).toContainText('✓');
  await expect(noneOption).toHaveCSS('border-top-color', 'rgb(198, 40, 40)');
  await partial.click();
  await expect(partialOption).toHaveCSS('border-top-color', 'rgb(230, 81, 0)');
  await expect(noneOption).not.toContainText('✓');
  await full.click();
  await expect(fullOption).toHaveCSS('border-top-color', 'rgb(46, 125, 50)');
  // The Yes/No criterion (the last one) is green for "Да" and red for "Нет".
  const yesNo = dialog.getByRole('radiogroup').last();
  await yesNo.getByRole('radio').first().click();
  await expect(yesNo.locator('label').first()).toHaveCSS('border-top-color', 'rgb(46, 125, 50)');
  await yesNo.getByRole('radio').nth(1).click();
  await expect(yesNo.locator('label').nth(1)).toHaveCSS('border-top-color', 'rgb(198, 40, 40)');
  // A second click on the chosen option takes the answer back ...
  await full.click();
  await expect(group.getByRole('radio', { checked: true })).toHaveCount(0);
  // ... and so does the "Clear answer" button, which each answered criterion has (here only the Yes/No one is still answered).
  await expect(dialog.getByRole('button', { name: 'Снять ответ', exact: true })).toHaveCount(1);
  await partial.click();
  await dialog.getByRole('button', { name: 'Снять ответ', exact: true }).first().click();
  await expect(group.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect.poll(() => dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
});

/** PR 446: the person filling a sheet never sees the formatting hint or the "feedback is required" sentence; they stay for screen readers / the editor. */
test('PR 446: filling a sheet shows no service hints (formatting hint, required-feedback sentence), the editor keeps its hint', async ({ page }) => {
  const sheet = previewSheet(); sheet.items = sheet.items.slice(0, 1); sheet.feedbackRequired = true; sheet.feedbackEnabled = true;
  await openPreviewBuilder(page, sheet);
  const hint = /правую кнопку мыши/;
  await expect(page.getByText(hint).first()).toBeVisible();
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: sheet.title, exact: true });
  await expect(dialog.getByLabel('Сильные стороны', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Сильные стороны и зоны развития обязательны.')).toHaveCount(0);
  const visible = await dialog.getByText(hint).evaluateAll((nodes) => nodes.filter((node) => (node as HTMLElement).getClientRects().length > 0 && getComputedStyle(node).clip !== 'rect(0px, 0px, 0px, 0px)' && (node as HTMLElement).getBoundingClientRect().width > 1).length);
  expect(visible).toBe(0);
  const described = await dialog.getByLabel('Сильные стороны', { exact: true }).getAttribute('aria-describedby');
  expect(described).toBeTruthy();
  await expect(dialog.locator(`[id="${described}"]`)).toHaveText(hint);
});
