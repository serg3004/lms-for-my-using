import { expect, test } from '@playwright/test';
import { longreadReaderServer, openLongreadPreview } from '../fixtures/longread-reader.js';
import { longreadLessonId } from '../fixtures/longread-editor.js';

test('published reader builds H2/H3 contents, preserves hidden contents headings, collapses the panel and restores reading position', async ({ page, context }) => {
  const server = longreadReaderServer(); await server.attach(page);
  const contents = page.getByRole('navigation', { name: 'Оглавление', exact: true });
  await expect(contents.locator('ul ul').getByRole('link', { name: 'Проверка оборудования', exact: true })).toBeVisible();
  await expect(contents.getByRole('link', { name: 'Только в тексте', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Только в тексте', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Скрыть оглавление', exact: true }).click(); await expect(contents).not.toBeVisible();
  await page.getByRole('button', { name: 'Показать оглавление', exact: true }).click();
  await contents.getByRole('link', { name: 'Проверка оборудования', exact: true }).click();
  await expect.poll(() => server.cursor().headingIndex).toBe(1);
  await page.getByRole('button', { name: 'Следующая глава', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Практическая часть', exact: true })).toBeVisible();
  await expect.poll(() => server.cursor().chapter).toBe('practice');
  await page.close(); const reopened = await context.newPage(); await server.attach(reopened);
  await expect(reopened.getByRole('heading', { name: 'Практическая часть', exact: true })).toBeVisible();
  expect(server.reads.some((path) => path.endsWith('/longread'))).toBe(false);
  expect(server.writes.every((item) => item.path.endsWith('/longread/position'))).toBe(true);
});

test('contents off removes the panel without an empty column; code stays inert and copy restrictions preserve keyboard access', async ({ page }) => {
  const server = longreadReaderServer({ tableOfContents: 'off', allowCopy: false });
  server.draft.chapters[0]!.blocks.find((block) => block.type === 'code')!.content.code = '<script>window.longreadAttack = true</script>';
  await server.attach(page);
  await expect(page.getByRole('navigation', { name: 'Оглавление', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /оглавление/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Копировать код', exact: true })).toHaveCount(0);
  const code = page.locator('.longread-reader pre'); await code.focus(); await expect(code).toBeFocused();
  await expect(code).toContainText('<script>');
  expect(await page.evaluate(() => 'longreadAttack' in window)).toBe(false);
  await expect(page.locator('.longread-reader script,.longread-reader iframe')).toHaveCount(0);
  const widths = await page.locator('.longread-reader article').evaluate((article) => ({ article: article.getBoundingClientRect().width, parent: article.parentElement!.getBoundingClientRect().width }));
  expect(Math.abs(widths.article - widths.parent)).toBeLessThan(2);
});

test('sequential navigation uses server permissions and rejects a direct jump to a locked or hidden chapter', async ({ page, context }) => {
  const server = longreadReaderServer({ readingOrder: 'sequential', requiredChapters: 2 }); await server.attach(page);
  await expect(page.getByLabel('Главы', { exact: true }).locator('option[value="finish"]')).toBeDisabled();
  const locked = await context.newPage(); await server.attach(locked, { hash: '#chapter=finish' });
  await expect(locked.getByRole('alert')).toContainText('недоступны'); await expect(locked.getByText('Третья глава. Итоги занятия.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Следующая глава', exact: true }).click(); await expect.poll(() => server.cursor().maxReached).toBe(1);
  await expect(page.getByLabel('Главы', { exact: true }).locator('option[value="finish"]')).toBeEnabled();
  await page.getByRole('button', { name: 'Следующая глава', exact: true }).click(); await expect(page.getByText('Третья глава. Итоги занятия.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Предыдущая глава', exact: true }).click(); await expect.poll(() => server.cursor().chapter).toBe('practice');
  const hidden = await context.newPage(); await server.attach(hidden, { hash: '#chapter=hidden' });
  await expect(hidden.getByRole('alert')).toContainText('недоступны'); await expect(hidden.getByText(/SECRET HIDDEN/)).toHaveCount(0);
});

test('a stable chapter hash opens the chapter and browser back restores navigation', async ({ page }) => {
  const server = longreadReaderServer(); await server.attach(page, { hash: '#chapter=practice' });
  await expect(page.getByRole('heading', { name: 'Практическая часть', exact: true })).toBeVisible();
  await page.getByLabel('Главы', { exact: true }).selectOption('finish'); await expect.poll(() => server.cursor().chapter).toBe('finish');
  await page.goBack(); await expect(page.getByRole('heading', { name: 'Практическая часть', exact: true })).toBeVisible();
  await expect.poll(() => server.cursor().chapter).toBe('practice');
});

test('RTL keeps mixed text, numbers, links and code readable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 }); const server = longreadReaderServer({ direction: 'rtl' }); await server.attach(page);
  await expect(page.locator('.longread-reader')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.longread-reader bdi[dir="ltr"]').first()).toHaveText('1 / 3');
  await expect(page.getByRole('link', { name: 'Инструкция 123', exact: true })).toHaveAttribute('href', 'https://example.invalid/guide/123');
  await expect(page.locator('.longread-reader pre')).toHaveAttribute('dir', 'ltr');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('navigation failures retain the current chapter and retry succeeds', async ({ page }) => {
  const server = longreadReaderServer(); await server.attach(page); server.failNext(500);
  await page.getByRole('button', { name: 'Следующая глава', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить');
  await expect(page.getByRole('heading', { name: 'Подготовка', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Практическая часть', exact: true })).toBeVisible();
});

for (const role of ['admin', 'instructor'] as const) test(`${role} previews chapter two and changes device width without learning writes`, async ({ page }) => {
  const { dialog, forbiddenWrites, previewReads } = await openLongreadPreview(page, { role, chapter: 1 });
  await expect(dialog.getByRole('heading', { name: 'Практическая часть', exact: true })).toBeVisible();
  const initialReads = previewReads.length; expect(initialReads).toBeGreaterThan(0);
  await dialog.getByLabel('Ширина предпросмотра', { exact: true }).selectOption('375px');
  expect((await dialog.locator('.longread-reader').boundingBox())!.width).toBeLessThanOrEqual(375);
  await dialog.getByLabel('Ширина предпросмотра', { exact: true }).selectOption('768px');
  expect((await dialog.locator('.longread-reader').boundingBox())!.width).toBeLessThanOrEqual(768);
  await dialog.getByLabel('Главы', { exact: true }).selectOption('intro');
  await expect(dialog.getByRole('heading', { name: 'Только в тексте', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Следующая глава', exact: true }).click();
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  expect(forbiddenWrites).toEqual([]); expect(previewReads).toHaveLength(initialReads);
  await expect(page.getByRole('button', { name: 'Предпросмотр', exact: true })).toBeFocused();
});

test('reader settings and heading contents visibility save through the editor', async ({ page }) => {
  const { dialog, editor } = await openLongreadPreview(page);
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByText('Настройки читателя', { exact: true }).click();
  await page.getByLabel('Направление текста', { exact: true }).selectOption('rtl');
  await page.getByLabel('Оглавление', { exact: true }).selectOption('off');
  await page.getByLabel('Число обязательных глав', { exact: true }).fill('2');
  await expect.poll(() => editor.snapshot().settings.direction).toBe('rtl');
  await page.getByRole('button', { name: '1. Заголовок', exact: true }).click();
  await page.getByLabel('Скрыть заголовок из оглавления', { exact: true }).check();
  await expect.poll(() => editor.snapshot().chapters[0]!.blocks[0]!.content.excludeFromToc).toBe(true);
  expect(editor.snapshot().settings).toMatchObject({ direction: 'rtl', tableOfContents: 'off', requiredChapters: 2 });
});

for (const locale of ['en', 'kk', 'zh'] as const) test(`reader controls are localized in ${locale}`, async ({ page }) => {
  await longreadReaderServer().attach(page, { locale });
  await expect(page.getByRole('button', { name: { en: 'Next chapter', kk: 'Келесі тарау', zh: '下一章' }[locale], exact: true })).toBeVisible();
});
for (const denied of [403, 404]) test(`unavailable reader handles ${denied} without requesting a draft`, async ({ page }) => {
  const server = longreadReaderServer(); await server.attach(page, { denied }); await expect(page.getByRole('alert')).toBeVisible();
  expect(server.reads.some((path) => path === `/lessons/${longreadLessonId}/longread`)).toBe(false);
});
