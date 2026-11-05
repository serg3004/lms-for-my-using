import { expect, test } from '@playwright/test';
import { openFormattingEditor, openFormattingPopup, selectDescription } from '../fixtures/checklist-formatting.js';

test('selected description formats, saves, previews, and resets without changing its source case', async ({ page }) => {
  const { editor, popup, saved } = await openFormattingPopup(page);
  for (const name of ['Жирный', 'Курсив', 'Подчёркнутый', 'Прописные']) await popup.getByRole('button', { name, exact: true }).click();
  await popup.getByRole('combobox', { name: 'Размер', exact: true }).selectOption('26');
  await popup.getByRole('button', { name: 'Цвет #1D4ED8', exact: true }).click();
  await popup.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(editor).toBeFocused(); await expect(editor.locator('strong')).toHaveText('Важный текст');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).first().click();
  await expect.poll(() => String(saved()?.description)).toContain('font-size:26px;color:#1D4ED8;text-transform:uppercase');
  expect(String(saved()?.description)).toContain('Важный текст');
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  const preview = page.getByRole('dialog', { name: '5S — рабочее место', exact: true });
  await expect(preview.getByText('Важный текст', { exact: true })).toHaveCSS('text-transform', 'uppercase');
  await expect(preview.getByText('Важный текст', { exact: true })).toHaveCSS('color', 'rgb(29, 78, 216)');
  await preview.getByRole('button', { name: 'Закрыть', exact: true }).first().click();
  await selectDescription(editor); await page.keyboard.press('Shift+F10');
  await page.getByRole('dialog', { name: 'Форматирование текста' }).getByRole('button', { name: 'Сбросить форматирование' }).click();
  await page.keyboard.press('Escape'); await expect(editor.locator('strong')).toHaveCount(0);
});

test('keyboard shortcuts, selection-only context menu and safe paste from Word', async ({ page }) => {
  const { editor } = await openFormattingEditor(page);
  await selectDescription(editor); await page.keyboard.press('ControlOrMeta+b'); await expect(editor.locator('strong')).toHaveText('Важный текст');
  await page.keyboard.press('ControlOrMeta+i'); await page.keyboard.press('ControlOrMeta+u');
  await expect(editor.locator('em')).toHaveText('Важный текст'); await expect(editor.locator('u')).toHaveText('Важный текст');
  await page.keyboard.press('Shift+F10'); await expect(page.getByRole('dialog', { name: 'Форматирование текста' })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(editor).toBeFocused();
  await editor.press('ArrowRight');
  expect(await editor.evaluate((element) => { const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); return element.dispatchEvent(event); })).toBe(true);
  await selectDescription(editor);
  await editor.evaluate((element) => { const data = new DataTransfer(); data.setData('text/html', '<p><span style="font-weight:700;color:#166534;position:fixed">Word</span><img src=x onerror=alert(1)><script>bad()</script></p>'); element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); });
  await expect(editor.locator('strong')).toHaveText('Word'); await expect(editor.locator('img,script,[style*="position"]')).toHaveCount(0);
});

for (const width of [320, 390]) test(`touch long-press and low-contrast warning fit at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  const { editor } = await openFormattingEditor(page), point = await selectDescription(editor);
  const bounds = await editor.boundingBox(); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 8);
  await editor.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: point.x, clientY: point.y });
  const popup = page.getByRole('dialog', { name: 'Форматирование текста' }); await expect(popup).toBeVisible();
  await editor.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 1 });
  await popup.getByLabel('Свой цвет', { exact: true }).fill('#ffff00');
  await expect(popup.getByRole('status')).toContainText('Низкий контраст');
  const rect = await popup.boundingBox(); expect(rect!.x).toBeGreaterThanOrEqual(0); expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
  await page.keyboard.press('Escape'); await expect(popup).toHaveCount(0);
});

test('criterion descriptions and scale-level descriptions use the same formatting editor', async ({ page }) => {
  await openFormattingEditor(page);
  const level = page.getByRole('textbox', { name: 'Описание (необязательно)', exact: true }).first();
  await selectDescription(level); await page.keyboard.press('ControlOrMeta+b'); await expect(level.locator('strong')).toHaveText('Нужна практика');
  await page.locator('.admin-criteria-row:not(.admin-criteria-row--head)').first().getByRole('button', { name: 'Действия', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Описание и пояснение…', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Критерий: описание и пояснение' });
  const hint = details.getByRole('textbox', { name: 'Что проверять и как оценивать', exact: true });
  await selectDescription(hint); await page.keyboard.press('Shift+F10');
  await page.getByRole('dialog', { name: 'Форматирование текста' }).getByRole('button', { name: 'Курсив', exact: true }).click();
  await page.keyboard.press('Escape'); await expect(details).toBeVisible(); await expect(hint.locator('em')).toHaveText('Проверьте маркировку');
});

for (const [locale, title] of [['en', 'Text formatting'], ['kk', 'Мәтінді пішімдеу'], ['zh', '文字格式']]) test(`formatting controls are localized (${locale})`, async ({ page }) => {
  const { editor } = await openFormattingEditor(page, locale); await selectDescription(editor); await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('dialog', { name: title, exact: true })).toBeVisible();
});

test('session report renders safe formatting and criterion hints from the snapshot', async ({ page }) => {
  const { openFormattedReport } = await import('../fixtures/checklist-formatting.js');
  await openFormattedReport(page);
  await expect(page.getByText('Важный текст', { exact: true })).toHaveCSS('font-weight', '700');
  await expect(page.getByText('bad()', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Критерии', exact: true }).click();
  await expect(page.getByText('Проверить маркировку', { exact: true })).toHaveCSS('font-style', 'italic');
});
