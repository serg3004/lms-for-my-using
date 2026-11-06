import { expect, test } from '@playwright/test';
import { openFormattingEditor, selectDescription } from '../fixtures/checklist-formatting.js';

for (const width of [320, 390, 1440]) test(`author title and criterion formatting survives save and preview at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const { sheet, saved } = await openFormattingEditor(page);
  const title = page.locator('#checklist-title');
  await title.fill('Название листа');
  const point = await selectDescription(title);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  const popup = page.getByRole('dialog', { name: 'Форматирование текста', exact: true });
  await popup.getByRole('button', { name: 'Жирный', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(title.locator('strong')).toHaveText('Название листа');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).first().click();
  await expect.poll(() => String(saved()?.title)).toContain('<strong>Название листа</strong>');
  let criterion: Record<string, unknown> | undefined;
  await page.route(`**/api/v1/checklist-items/${sheet.items[0]!.id}`, (route) => {
    criterion = route.request().postDataJSON(); Object.assign(sheet.items[0]!, criterion); return route.fulfill({ json: sheet.items[0] });
  });
  const field = page.locator(`[id="item-text-${sheet.items[0]!.id}"]`);
  await field.fill('Критерий');
  const criterionPoint = await selectDescription(field);
  await page.mouse.click(criterionPoint.x, criterionPoint.y, { button: 'right' });
  await popup.getByRole('button', { name: 'Курсив', exact: true }).click();
  await page.keyboard.press('Escape');
  // Closing the window gives the focus back to the editor on the next frame; blur only after that, or the editor takes it back.
  await expect(field).toBeFocused();
  await field.blur();
  await expect.poll(() => String(criterion?.text)).toContain('<em>Критерий</em>');
  await page.screenshot({ path: test.info().outputPath(`builder-${width}.png`) });
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Название листа', exact: true });
  await expect(preview.getByText('Название листа', { exact: true })).toHaveCSS('font-weight', '700');
  await expect(preview.getByText('Критерий', { exact: true })).toHaveCSS('font-style', 'italic');
  await page.screenshot({ path: test.info().outputPath(`preview-${width}.png`) });
});

test('single-line paste joins lines and Enter does not insert a paragraph', async ({ page }) => {
  await openFormattingEditor(page);
  const title = page.locator('#checklist-title');
  await title.fill('');
  await title.evaluate((element) => {
    const data = new DataTransfer(); data.setData('text/html', '<p><strong>First</strong></p><p>Second</p><script>bad()</script>');
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(title).toHaveText('First Second');
  await title.press('End'); await title.press('Enter');
  await expect(title.locator('p')).toHaveCount(1);
  await expect(title.locator('strong')).toHaveText('First');
});
