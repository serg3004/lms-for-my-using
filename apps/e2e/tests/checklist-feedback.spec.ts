import { expect, test } from '@playwright/test';
import { answerSetServer, openFeedbackBuilder, openFeedbackConduct } from '../fixtures/checklist-feedback.js';
import { openPreviewBuilder, previewSheet } from '../fixtures/checklist-preview.js';

test('builds nested feedback, reorders fields, saves the layout and resets to legacy defaults', async ({ page }) => {
  const sheet = await openFeedbackBuilder(page);
  const block = page.locator('.admin-feedback-block');
  let saved: Record<string, unknown> | undefined;
  await page.route(`**/api/v1/checklists/${sheet.id}`, (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    saved = route.request().postDataJSON(); return route.fulfill({ json: { ...sheet, ...saved } });
  });
  await block.getByLabel('Название раздела обратной связи', { exact: true }).fill('Индивидуальный план');
  await block.getByRole('button', { name: '+ Добавить поле', exact: true }).first().click();
  await block.getByLabel('Название поля', { exact: true }).nth(1).fill('Цель');
  await block.getByRole('button', { name: 'Элемент 2 вверх', exact: true }).first().click();
  await expect(block.getByLabel('Название поля', { exact: true }).first()).toHaveValue('Цель');
  await block.getByRole('combobox', { name: 'Режим выбора', exact: true }).selectOption('single');
  await expect(block.getByText('Готов — Работает самостоятельно', { exact: true })).toBeVisible();
  await expect(block.getByRole('button', { name: '+ Добавить подраздел', exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Сохранить', exact: true }).first().click();
  await expect.poll(() => saved?.feedbackLayout).toMatchObject({ title: 'Индивидуальный план', fields: [{ title: 'Цель' }, { title: 'Рекомендация' }] });
  await block.getByRole('button', { name: 'Вернуть по умолчанию', exact: true }).click();
  await expect(block.getByLabel('Название поля', { exact: true })).toHaveCount(3);
  await expect(block.getByLabel('Название поля', { exact: true }).first()).toHaveValue('Сильные стороны');
  await expect(block.getByLabel('Название раздела', { exact: true })).toHaveCount(0);
});

test('preview renders custom sections and choice descriptions without saving answers', async ({ page }) => {
  await openFeedbackBuilder(page); const writes: string[] = [];
  page.on('request', (request) => { if (request.method() !== 'GET' && request.url().includes('/api/v1/')) writes.push(request.url()); });
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'План развития', exact: true })).toBeVisible();
  await dialog.getByLabel('Рекомендация *', { exact: true }).fill('Практика на смене');
  await dialog.getByRole('checkbox', { name: /Готов Работает самостоятельно/ }).check();
  await expect(dialog.getByRole('heading', { name: 'Следующая смена', exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});

test('observer autosaves custom answers, cannot complete before required fields and sees frozen answers in the report', async ({ page }) => {
  const data = await openFeedbackConduct(page);
  const complete = page.getByRole('button', { name: 'Завершить', exact: true });
  await expect(complete).toBeDisabled();
  await page.getByRole('textbox', { name: 'Рекомендация *', exact: true }).fill('Повторить завтра');
  await expect.poll(() => data.saves.length).toBe(1);
  await expect(complete).toBeDisabled();
  await page.getByRole('checkbox', { name: /Готов Работает самостоятельно/ }).check();
  await expect(complete).toBeEnabled();
  expect(data.session.feedbackAnswers).toEqual({ note: 'Повторить завтра', verdict: ['ready'] });
  await page.getByRole('textbox', { name: 'Рекомендация *', exact: true }).fill('Повторить завтра и послезавтра');
  await expect(complete).toBeDisabled();
  await expect(complete).toBeEnabled();
  await complete.click();
  await page.goto('/instructor/checklists/sessions/all/scale-session');
  const feedback = page.getByRole('region', { name: 'План развития', exact: true });
  await expect(feedback).toContainText('Повторить завтра и послезавтра');
  await expect(feedback).toContainText('Готов — Работает самостоятельно');
});

test('answer-set creation, failed save keeps the draft, keyboard ordering, archive, copy and guarded delete', async ({ page }) => {
  const server = answerSetServer(); await server.attach(page);
  await page.getByRole('link', { name: 'Новый набор ответов', exact: true }).click();
  await page.getByLabel('Название набора ответов', { exact: true }).fill('Согласование');
  await page.getByLabel('Название ответа 1', { exact: true }).fill('Да');
  await page.getByLabel('Описание ответа 1', { exact: true }).fill('Проверено');
  await page.getByLabel('Название ответа 2', { exact: true }).fill('Нет');
  await page.getByRole('button', { name: 'Элемент 2 вверх', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByLabel('Название ответа 1', { exact: true })).toHaveValue('Нет');
  const handle = page.getByRole('button', { name: 'Перетащить элемент 2', exact: true });
  await handle.focus(); await page.keyboard.press('Space'); await expect(handle).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowUp'); await expect(page.getByRole('status').filter({ hasText: '«Элемент 2» над «Элемент 1».' })).toBeVisible();
  await page.keyboard.press('Space'); await expect(page.getByLabel('Название ответа 1', { exact: true })).toHaveValue('Да');
  server.fail(500); await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось сохранить');
  await expect(page.getByLabel('Название набора ответов', { exact: true })).toHaveValue('Согласование');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('link', { name: /Согласование · Ответов/ }).click();
  await page.getByRole('button', { name: 'В архив', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'В архив', exact: true }).click();
  await page.getByRole('link', { name: /Согласование · Ответов/ }).click();
  await expect(page.getByLabel('Название набора ответов', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Сделать копию', exact: true }).click();
  await expect(page.getByLabel('Название набора ответов', { exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Удалить', exact: true }).last().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await page.getByRole('link', { name: /Готовность к работе · Ответов/ }).click();
  server.items[0]!.inUse = true;
  await page.getByRole('button', { name: 'Удалить', exact: true }).last().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('не может быть удалён');
});

for (const role of ['instructor', 'mentor'] as const) test(`${role} can manage answer sets from the shared library`, async ({ page }) => {
  const server = answerSetServer(role); await server.attach(page, '/readiness');
  await page.getByLabel('Название набора ответов', { exact: true }).fill('Новая версия');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${server.base}$`)); expect(server.writes[0]?.method).toBe('PATCH');
});

for (const locale of ['ru', 'en', 'kk', 'zh']) test(`default feedback fields are localized and custom titles stay unchanged (${locale})`, async ({ page }) => {
  await openPreviewBuilder(page, previewSheet(), locale);
  const fields = page.locator('.admin-feedback-block input[maxlength="255"]');
  expect(await fields.nth(1).inputValue()).toBe({ ru: 'Сильные стороны', en: 'Strengths', kk: 'Күшті жақтары', zh: '优点' }[locale]);
  await fields.first().fill('Custom title'); await expect(fields.first()).toHaveValue('Custom title');
});
