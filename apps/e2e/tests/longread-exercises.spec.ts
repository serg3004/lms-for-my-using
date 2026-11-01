import { expect, test, type Page } from '@playwright/test';
import { exerciseReaderServer, exerciseEditorServer } from '../fixtures/longread-exercises.js';
async function answer(page: Page, index: number, correct: boolean, check = 'Проверить ответ') {
  const block = page.getByRole('region', { name: `Exercise ${index + 1}`, exact: true });
  if (index === 1) for (const option of await block.getByRole('checkbox').all()) await option.uncheck();
  if (index < 2) await block.getByLabel(correct ? 'Good' : 'Bad', { exact: true }).check();
  else if (index === 2) await block.getByRole('radio').nth(correct ? 0 : 1).check();
  else if (index === 3) { const selects = block.getByRole('combobox'); await selects.nth(0).selectOption(''); await selects.nth(1).selectOption(''); await selects.nth(0).selectOption(correct ? 'b' : 'a'); await selects.nth(1).selectOption(correct ? 'a' : 'b'); }
  else if (index === 4) { const selects = block.getByRole('combobox'); await selects.nth(0).selectOption(''); await selects.nth(1).selectOption(''); await selects.nth(0).selectOption(correct ? 'b' : 'a'); await selects.nth(1).selectOption(correct ? 'a' : 'b'); }
  else await block.getByRole('textbox').fill(correct ? index === 5 ? 'Алматы' : 'Café' : 'wrong');
  await block.getByRole('button', { name: check, exact: true }).click();
  await expect(block.getByRole('status')).toContainText(correct ? '8 / 8' : '0 / 8');
}
test('all seven response controls check wrong and right answers, restore counters and finish the final test', async ({ page }) => {
  const server = exerciseReaderServer(); await server.attach(page);
  for (let i = 0; i < 7; i++) { await answer(page, i, false); await page.getByRole('region', { name: `Exercise ${i + 1}`, exact: true }).getByRole('button', { name: 'Новая попытка', exact: true }).click(); await answer(page, i, true); }
  await page.reload(); const first = page.getByRole('region', { name: 'Exercise 1', exact: true });
  await expect(first).toContainText('Использовано попыток: 2 из 2'); await expect(first.getByRole('button', { name: 'Новая попытка' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Завершить итоговый тест', exact: true }).click(); await expect(page.getByRole('link', { name: 'Открыть результат' })).toBeVisible();
  expect(server.writes.filter((w) => w.path.endsWith('/attempts'))).toHaveLength(14); expect(server.writes.filter((w) => w.path.endsWith('/finish'))).toHaveLength(1);
});
test('network retry preserves request id, expected attempt and answer', async ({ page }) => {
  const server = exerciseReaderServer(); await server.attach(page); server.failNext(500);
  const block = page.getByRole('region', { name: 'Exercise 1', exact: true }); await block.getByLabel('Good', { exact: true }).check(); await block.getByRole('button', { name: 'Проверить ответ', exact: true }).click();
  await expect(block.getByRole('alert')).toBeVisible(); await block.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(block.getByRole('status')).toContainText('8 / 8'); expect(server.writes[0]!.body).toEqual(server.writes[1]!.body);
});
for (const [locale, check] of [['ru', 'Проверить ответ'], ['en', 'Check answer'], ['kk', 'Жауапты тексеру'], ['zh', '检查答案']] as const) test(`${locale}: narrow RTL reader has labelled keyboard controls and localized feedback`, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 }); const server = exerciseReaderServer({ direction: 'rtl' }); await server.attach(page, locale);
  await answer(page, 6, true, check); await expect(page.locator('.longread-reader')).toHaveAttribute('dir', 'rtl');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('region', { name: 'Exercise 4', exact: true }).getByRole('combobox').first().focus(); await expect(page.getByRole('region', { name: 'Exercise 4', exact: true }).getByRole('combobox').first()).toBeFocused();
});
test('author edits all seven question formats and keeps the linked question settings', async ({ page }) => {
  const server = exerciseEditorServer(); await server.attach(page);
  for (let i = 0; i < 7; i++) {
    const block = page.getByRole('article', { name: `${i + 1}. Задание`, exact: true });
    await block.getByRole('button', { name: 'Изменить вопрос', exact: true }).click(); const form = block.getByRole('region', { name: 'Редактор вопроса', exact: true });
    await form.getByLabel('Название вопроса', { exact: true }).fill(`Updated ${i}`);
    await form.getByRole('button', { name: 'Сохранить и связать вопрос', exact: true }).click(); await expect(form).toHaveCount(0);
  }
  expect(server.writes.map((q) => q.type)).toEqual(['single_choice', 'multiple_choice', 'true_false', 'matching', 'ordering', 'fill_blank', 'short_answer']);
  await page.getByRole('button', { name: 'Опубликовать версию', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: 'Опубликована версия 2.' })).toBeVisible();
});

test('preview checks a typed answer without loading or writing real attempts', async ({ page }) => {
  const server = exerciseReaderServer({ preview: true }); await server.attach(page);
  await answer(page, 6, true);
  expect(server.writes).toHaveLength(1); expect(server.writes[0]!.path).toMatch(/\/preview$/);
  expect(server.state.exercises.every((value) => value.attemptsUsed === 0)).toBe(true);
  await expect(page.getByRole('button', { name: 'Завершить итоговый тест', exact: true })).toHaveCount(0);
});

test('creates a short-answer question and autosaves its new reference without a revision conflict', async ({ page }) => {
  const server = exerciseEditorServer(6); await server.attach(page);
  await page.getByRole('button', { name: 'Создать вопрос', exact: true }).click();
  const form = page.getByRole('region', { name: 'Редактор вопроса', exact: true });
  await form.getByLabel('Тип вопроса', { exact: true }).selectOption('short_answer');
  await form.getByLabel('Название вопроса', { exact: true }).fill('Новый вопрос');
  await form.getByLabel('Допустимые ответы (по одному на строку)', { exact: true }).fill('Астана\nAstana');
  await form.getByRole('button', { name: 'Сохранить и связать вопрос', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect.poll(() => server.editor.writes.at(-1)?.chapters[0]?.blocks[0]?.content.questionId).toBe('38900000-0000-4000-8000-000000000401');
  expect(server.editor.writes.at(-1)?.revision).toBe(2);
  await expect(page.getByRole('combobox', { name: 'Вопрос из теста этого урока', exact: true })).toHaveValue('38900000-0000-4000-8000-000000000401');
});
test('editing a blank identifier retains keyboard focus and writes the explicit text policy', async ({ page }) => {
  const server = exerciseEditorServer(5); await server.attach(page);
  await page.getByRole('button', { name: 'Изменить вопрос', exact: true }).click(); const form = page.getByRole('region', { name: 'Редактор вопроса', exact: true });
  const field = form.getByLabel('Идентификатор пропуска', { exact: true }); await field.focus(); await field.press('End'); await field.pressSequentially('Name');
  await expect(field).toHaveValue('cityName'); await expect(field).toBeFocused();
  await form.getByLabel('Учитывать регистр', { exact: true }).check(); await form.getByRole('combobox', { name: /^Пробелы/ }).selectOption('exact');
  await form.getByRole('button', { name: 'Сохранить и связать вопрос', exact: true }).click();
  await expect.poll(() => server.writes.length).toBe(1);
  expect(server.writes[0]?.definition).toMatchObject({ type: 'fill_blank', blanks: [{ id: 'cityName' }], caseSensitive: true, whitespace: 'exact' });
});
