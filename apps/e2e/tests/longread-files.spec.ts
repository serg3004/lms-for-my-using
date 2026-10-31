import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { longreadFileServer, mediaId } from '../fixtures/longread-files.js';
const png = readFileSync(new URL('../fixtures/assets/longread-safety.png', import.meta.url));
const imageFile = (name = 'replacement.png') => ({ name, mimeType: 'image/png', buffer: png });
const pdfFile = (n: number) => ({ name: `instruction-${n}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nsynthetic\n%%EOF') });

test('learner sees document/chapter covers, alt, captions and downloads an attachment through a fresh URL', async ({ page }) => {
  const files = longreadFileServer(); await files.reader(page);
  await expect(page.getByAltText('Защитное оборудование')).toHaveCount(3);
  await expect(page.getByText('Обложка документа', { exact: true })).toBeVisible();
  await expect(page.getByText('Обложка главы', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Скачать: Инструкция по безопасности.pdf', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('Инструкция по безопасности.pdf'); expect(files.signed).toContain(mediaId(3));
});
test('image replacement keeps its caption/alt/geometry after saving and reloading', async ({ page }) => {
  const files = longreadFileServer(), server = await files.editor(page);
  const block = page.getByRole('article', { name: '1. Изображение', exact: true });
  await block.getByLabel('Альтернативный текст', { exact: false }).fill('Новая схема 123');
  await block.getByLabel('Подпись', { exact: true }).fill('Новая подпись'); await block.getByLabel('Ширина, %').fill(''); await expect(block.getByLabel('Ширина, %')).toBeVisible(); await block.getByLabel('Ширина, %').fill('60');
  await block.getByLabel('Выравнивание').selectOption('end');
  await block.getByLabel('Загрузить или заменить изображение').setInputFiles(imageFile());
  await expect.poll(() => files.uploaded.length).toBe(1);
  await expect.poll(() => server.snapshot().chapters[0]!.blocks[0]!.content).toMatchObject({ alt: 'Новая схема 123', caption: 'Новая подпись', width: 60, align: 'end', fileId: files.uploaded[0] });
  await page.reload(); await expect(block.getByAltText('Новая схема 123')).toBeVisible(); await expect(block.locator('figcaption').filter({ hasText: 'Новая подпись' })).toBeVisible();
});
test('document and chapter covers can be removed and remain removed after reload', async ({ page }) => {
  const files = longreadFileServer(), server = await files.editor(page);
  for (const name of ['Обложка документа', 'Обложка главы']) {
    const details = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: new RegExp(`^${name}$`) }) });
    await details.locator('summary').click(); await details.getByRole('button', { name: 'Удалить обложку', exact: true }).click();
  }
  await expect.poll(() => server.snapshot().settings.cover).toBeNull(); await expect.poll(() => server.snapshot().chapters[0]!.cover).toBeNull();
  await page.reload(); await page.locator('summary').filter({ hasText: /^Обложка главы$/ }).click();
  await expect(page.getByRole('button', { name: 'Добавить обложку', exact: true })).toBeVisible();
});
test('rejects 21 selected attachments before sending a request and accepts 20 without a document-wide cap', async ({ page }) => {
  const files = longreadFileServer(), server = await files.editor(page);
  const input = page.getByRole('article', { name: '2. Вложения', exact: true }).getByLabel('Добавить вложения');
  await input.setInputFiles(Array.from({ length: 21 }, (_, i) => pdfFile(i))); await expect(page.getByRole('alert')).toContainText('от 1 до 20'); expect(files.batches).toHaveLength(0);
  await input.setInputFiles(Array.from({ length: 20 }, (_, i) => pdfFile(i)));
  await expect.poll(() => files.uploaded.length).toBe(20); expect(files.batches[0]).toHaveLength(20);
  await expect.poll(() => (server.snapshot().chapters[0]!.blocks[1]!.content.files as unknown[]).length).toBe(21);
});
test('uses direct multipart upload above 8 MB with bounded parts and the longread completion route', async ({ page }) => {
  const files = longreadFileServer(); await files.editor(page);
  const bytes = Buffer.alloc(9 * 1024 * 1024); bytes.write('%PDF-1.7\n');
  await page.getByRole('article', { name: '2. Вложения', exact: true }).getByLabel('Добавить вложения').setInputFiles({ name: 'large.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect.poll(() => files.uploaded.length).toBe(1); expect(files.multipartParts.sort((a, b) => a - b)).toEqual([1024 * 1024, 8 * 1024 * 1024]);
});
test('author preview displays media and attachments without writing learning records', async ({ page }) => {
  const files = longreadFileServer(); await files.editor(page);
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click(); const dialog = page.getByRole('dialog', { name: /Предпросмотр/ });
  await expect(dialog.getByAltText('Защитное оборудование')).toHaveCount(3); await expect(dialog.getByRole('button', { name: /^Скачать:/ })).toBeVisible();
  await dialog.getByLabel('Ширина предпросмотра').selectOption('375px'); expect((await dialog.locator('.longread-reader').boundingBox())!.width).toBeLessThanOrEqual(375);
  expect(files.learningWrites).toEqual([]);
});
test('an unavailable file does not expose a stale URL or break the reader', async ({ page }) => {
  const files = longreadFileServer(); await files.reader(page); files.deny(); await page.reload();
  await expect(page.getByText('Файл недоступен или ещё не прошёл проверку.').first()).toBeVisible();
  const before = files.signed.length; await page.getByRole('button', { name: /^Скачать:/ }).click();
  await expect(page.getByRole('alert')).toContainText('Файл недоступен'); expect(files.signed).toHaveLength(before);
});
for (const width of [375, 768, 1440]) test(`media is responsive in RTL at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await longreadFileServer().reader(page, 'rtl');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
for (const [locale, label] of [['en', 'Upload or replace image'], ['kk', 'Кескінді жүктеу немесе ауыстыру'], ['zh', '上传或替换图片']] as const) test(`media controls are localized in ${locale}`, async ({ page }) => {
  await longreadFileServer().editor(page, { locale }); await expect(page.getByRole('article').first().getByLabel(label)).toBeVisible();
});
