import { expect, test } from '@playwright/test';
import { longreadCourseId, longreadEditorServer, longreadFixture, longreadLessonId } from '../fixtures/longread-editor.js';

test('creating a longread from the lesson form opens its draft editor', async ({ page }) => {
  const server = longreadEditorServer(); await server.attach(page);
  await page.route('**/api/v1/courses?pageSize=200', (route) => route.fulfill({ json: { items: [{ id: longreadCourseId, organizationId: 'org', title: 'Безопасность', slug: 'safety', status: 'draft' }], total: 1 } }));
  await page.route('**/api/v1/lessons?pageSize=200', (route) => route.fulfill({ json: { items: [], total: 0 } }));
  let input: Record<string, unknown> | null = null;
  await page.route(`**/api/v1/courses/${longreadCourseId}/lessons`, (route) => { input = route.request().postDataJSON(); return route.fulfill({ json: { id: longreadLessonId } }); });
  await page.goto('/admin/lessons');
  await page.getByRole('button', { name: /Создать задание/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Название задания/).fill('Безопасная работа');
  await dialog.getByLabel('Тип', { exact: true }).selectOption('longread');
  await dialog.getByRole('button', { name: 'Создать черновик', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/lessons/${longreadLessonId}/longread$`));
  await expect(page.locator('.tiptap')).toBeVisible(); expect(input).toMatchObject({ type: 'longread', status: 'draft' });
});

test('creates H1-H3, quote, note, divider and code with their properties', async ({ page }) => {
  const server = longreadEditorServer(); await server.attach(page);
  await page.getByRole('navigation', { name: 'Главы', exact: true }).getByRole('button', { name: '2. Практика', exact: true }).click();
  for (const type of ['heading', 'quote', 'note', 'divider', 'code']) {
    await page.getByLabel('Тип нового блока', { exact: true }).selectOption(type);
    await page.getByRole('button', { name: 'Добавить блок', exact: true }).click();
    if (type === 'heading') {
      await page.getByRole('textbox', { name: 'Текст', exact: true }).fill('Правила');
      for (const level of ['1', '3', '2']) await page.getByLabel('Уровень заголовка', { exact: true }).selectOption(level);
    }
    if (type === 'quote') { await page.getByRole('textbox', { name: 'Текст', exact: true }).fill('Сначала безопасность'); await page.getByLabel('Автор цитаты', { exact: true }).fill('Инструктор'); }
    if (type === 'note') { await page.getByRole('textbox', { name: 'Текст', exact: true }).fill('Проверьте питание'); await page.getByLabel('Вид заметки', { exact: true }).selectOption('warning'); }
    if (type === 'code') { await page.getByLabel('Текст кода', { exact: true }).fill('print("safe")'); await page.getByLabel('Язык кода', { exact: true }).fill('python'); }
  }
  await expect.poll(() => server.snapshot().chapters[1]!.blocks.at(-1)?.content.language).toBe('python');
  const blocks = server.snapshot().chapters[1]!.blocks;
  expect(blocks.map((block) => block.type)).toEqual(['heading', 'quote', 'note', 'divider', 'code']);
  expect(blocks[0]!.content).toMatchObject({ level: 2, runs: [{ text: 'Правила' }] });
  expect(blocks[1]!.content).toMatchObject({ caption: 'Инструктор' });
  expect(blocks[2]!.content).toMatchObject({ tone: 'warning' });
  await page.reload(); await expect(page.getByRole('navigation', { name: 'Главы', exact: true })).toBeVisible();
});

test('block names, visibility, duplication and movement persist with new identities', async ({ page }) => {
  const server = longreadEditorServer(); await server.attach(page);
  const properties = page.getByRole('complementary', { name: 'Свойства блока', exact: true });
  await properties.getByLabel('Название блока', { exact: true }).fill('Инструкция');
  await properties.getByRole('button', { name: 'Скрыть', exact: true }).click();
  await properties.getByRole('button', { name: 'Создать копию', exact: true }).click();
  await properties.getByLabel('Переместить в главу', { exact: true }).selectOption(longreadFixture.chapters[1]!.id);
  await expect.poll(() => server.snapshot().chapters[1]!.blocks.length).toBe(1);
  const original = server.snapshot().chapters[0]!.blocks[0]!, copy = server.snapshot().chapters[1]!.blocks[0]!;
  expect(copy.id).not.toBe(original.id); expect(copy.content).toEqual(original.content); expect(copy).toMatchObject({ title: 'Инструкция', hidden: true });
});

test('unknown block content is preserved without rendering active HTML', async ({ page }) => {
  const draft = structuredClone(longreadFixture);
  const content = { html: '<iframe srcdoc="<script>attack()</script>"></iframe>', data: { text: 'opaque' } };
  draft.chapters[0]!.blocks.push({ id: '38300000-0000-4000-8000-000000000008', type: 'future_widget', schemaVersion: 9, known: false, title: null, hidden: false, content });
  const server = longreadEditorServer(draft); await server.attach(page);
  await expect(page.getByText('Этот тип или версия блока пока не поддерживается.', { exact: false })).toBeVisible();
  await expect(page.locator('.lr-editor iframe')).toHaveCount(0);
  await page.getByLabel('Название главы', { exact: true }).fill('Новая вводная');
  await expect.poll(() => server.snapshot().revision).toBe(2);
  expect(server.snapshot().chapters[0]!.blocks[3]!.content).toEqual(content);
});

test('two chapters, formatting, three list levels and code survive closing and reopening', async ({ page, context }) => {
  const server = longreadEditorServer(); await server.attach(page);
  await page.getByLabel('Название главы', { exact: true }).fill('Введение и правила');
  await expect(page.getByRole('status')).toContainText('Сохранено');
  await expect.poll(() => server.writes.length).toBe(1);
  const saved = server.snapshot();
  await page.close(); const reopened = await context.newPage(); await server.attach(reopened);
  await expect(reopened.getByLabel('Название главы', { exact: true })).toHaveValue('Введение и правила');
  expect(server.snapshot()).toEqual(saved);
  expect(saved.chapters).toHaveLength(2);
  expect(saved.chapters[0]!.blocks[0]!.content).toEqual({ runs: [{ text: 'Безопасная работа', bold: true }, { text: ' начинается с подготовки. ' }, { text: 'Инструкция', italic: true, underline: true, href: 'https://example.invalid/guide' }] });
  expect(saved.chapters[0]!.blocks[1]!.content.items).toMatchObject([{ level: 1 }, { level: 2 }, { level: 3 }]);
  await expect(reopened.getByLabel('Текст кода', { exact: true })).toHaveValue('const ready = true;\n// Код остаётся текстом');
});

test('rich editing, safe links and hostile paste stay structured and inert', async ({ page }) => {
  const server = longreadEditorServer(); await server.attach(page);
  const text = page.getByRole('textbox', { name: 'Текст', exact: true });
  await text.fill('Безопасный текст');
  const bold = page.getByRole('button', { name: 'Жирный', exact: true });
  await text.press('ControlOrMeta+a');
  if (await bold.getAttribute('aria-pressed') === 'true') await bold.click();
  await text.press('ControlOrMeta+a'); await bold.click();
  await expect(text.locator('strong')).toHaveText('Безопасный текст');
  await page.getByRole('button', { name: 'Ссылка', exact: true }).click();
  await page.getByLabel('Адрес ссылки', { exact: true }).fill('javascript:window.longreadAttack=1');
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Разрешены только');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await text.focus(); await text.press('End');
  await text.evaluate((element) => {
    const data = new DataTransfer(); data.setData('text/html', '<p onclick="window.longreadAttack=1">Вставка<img src="x" onerror="window.longreadAttack=1"></p><script>window.longreadAttack=1</script><iframe srcdoc="bad"></iframe>');
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(text).toContainText('Вставка');
  await expect(text.locator('script,iframe,img,[onclick],[onerror]')).toHaveCount(0);
  expect(await page.evaluate(() => 'longreadAttack' in window)).toBe(false);
  await expect.poll(() => server.snapshot().revision).toBeGreaterThan(1);
  const payload = JSON.stringify(server.snapshot().chapters[0]!.blocks[0]!.content);
  expect(payload).not.toMatch(/javascript:|onerror|onclick|<script|<iframe/);
});

test('list nesting stops at level three and pasted code is never executed', async ({ page }) => {
  const server = longreadEditorServer(); await server.attach(page);
  await page.getByRole('button', { name: '2. Список', exact: true }).click();
  const list = page.getByRole('textbox', { name: 'Текст', exact: true });
  await list.locator('li').last().click();
  await expect(page.getByRole('button', { name: 'Увеличить отступ', exact: true })).toBeDisabled();
  await list.press('Tab'); await list.press('Tab');
  expect(await list.locator('ul ul ul ul').count()).toBe(0);
  await page.getByLabel('Текст кода', { exact: true }).fill('<script>window.codeAttack = true</script>');
  await expect.poll(() => server.snapshot().revision).toBeGreaterThan(1);
  expect(await page.evaluate(() => 'codeAttack' in window)).toBe(false);
  expect(server.snapshot().chapters[0]!.blocks[1]!.content.items).toMatchObject([{ level: 1 }, { level: 2 }, { level: 3 }]);
});

test('two windows conflict without overwriting; local edits can be copied and the current version reloaded', async ({ page, context }) => {
  const server = longreadEditorServer(); await server.attach(page);
  const second = await context.newPage(); await server.attach(second);
  await page.getByLabel('Название главы', { exact: true }).fill('Правка первого окна');
  await expect.poll(() => server.snapshot().revision).toBe(2);
  await second.getByLabel('Название главы', { exact: true }).fill('Мои правки второго окна');
  await expect(second.getByRole('alert')).toContainText('Документ изменён');
  expect(server.snapshot().chapters[0]!.title).toBe('Правка первого окна');
  await second.getByRole('button', { name: 'Скопировать мои правки', exact: true }).click();
  await expect(second.getByRole('dialog').locator('textarea')).toContainText('Мои правки второго окна');
  await second.getByRole('button', { name: 'Закрыть', exact: true }).click();
  second.once('dialog', (dialog) => dialog.accept());
  await second.getByRole('button', { name: 'Перезагрузить', exact: true }).click();
  await expect(second.getByLabel('Название главы', { exact: true })).toHaveValue('Правка первого окна');
});

test('chapter and block actions, keyboard reordering, confirmation, undo and redo', async ({ page }) => {
  const server = longreadEditorServer(); await server.attach(page);
  const chapterActions = page.getByRole('group', { name: 'Действия с главой' });
  await chapterActions.getByRole('button', { name: 'Скрыть', exact: true }).click();
  await chapterActions.getByRole('button', { name: 'Создать копию', exact: true }).click();
  await expect(page.getByLabel('Название главы', { exact: true })).toHaveValue('Введение (копия)');
  await page.getByRole('navigation', { name: 'Главы', exact: true }).getByRole('button', { name: /2\. Введение \(копия\)/ }).press('Alt+ArrowUp');
  await chapterActions.getByRole('button', { name: 'Удалить', exact: true }).click();
  await page.getByRole('dialog').press('ControlOrMeta+z');
  await expect(page.locator('.lr-chapters button')).toHaveCount(3);
  await page.getByRole('dialog').getByRole('button', { name: 'Отмена', exact: true }).click();
  await chapterActions.getByRole('button', { name: 'Удалить', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await page.getByRole('button', { name: 'Повторить правку', exact: true }).click();
  await expect.poll(() => server.snapshot().chapters.length).toBe(2);
  const names = server.snapshot().chapters.map((chapter) => chapter.title); expect(names).toEqual(['Введение', 'Практика']);
});

test('failed autosave retains edits and retry works, including typing during a request', async ({ page }) => {
  const server = longreadEditorServer(); await server.attach(page); server.failNext(500);
  await page.getByLabel('Название главы', { exact: true }).fill('Сохранить после ошибки');
  await expect(page.getByRole('alert')).toContainText('Не удалось сохранить');
  server.pause(); await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Сохраняем');
  await page.getByLabel('Название главы', { exact: true }).fill('Правка во время сохранения'); server.resume();
  await expect.poll(() => server.snapshot().chapters[0]!.title).toBe('Правка во время сохранения');
  await expect(page.getByRole('status')).toContainText('Сохранено');
});

for (const locale of ['en', 'kk', 'zh'] as const) test(`editor controls are translated in ${locale}`, async ({ page }) => {
  const server = longreadEditorServer(); await server.attach(page, { locale });
  await expect(page.getByRole('button', { name: { en: 'Add chapter', kk: 'Тарау қосу', zh: '添加章节' }[locale], exact: true })).toBeVisible();
});

for (const denied of [403, 404]) test(`editor handles ${denied} without displaying draft content`, async ({ page }) => {
  await longreadEditorServer().attach(page, { denied });
  await expect(page.getByRole('alert')).toBeVisible(); await expect(page.locator('.tiptap')).toHaveCount(0);
});
