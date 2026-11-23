import { expect, test } from '@playwright/test';
import { openTypedAssessment, typedQuestionMessage } from '../fixtures/assessment-typed-compat.js';

for (const type of ['matching', 'ordering', 'fill_blank', 'short_answer', 'true_false']) test(`legacy taking form rejects ${type} without starting a timed attempt`, async ({ page }) => {
  const fixture = await openTypedAssessment(page, { type });
  await expect(page.getByText(typedQuestionMessage)).toBeVisible();
  await expect(page.locator('input[type=radio], input[type=checkbox]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Отправить ответы', exact: true })).toHaveCount(0);
  await page.reload(); await expect(page.getByText(typedQuestionMessage)).toBeVisible();
  expect(fixture.writes).toEqual([]);
});
for (const locale of ['en', 'kk', 'zh'] as const) test(`unsupported question message uses ${locale}`, async ({ page }) => {
  const fixture = await openTypedAssessment(page, { locale }); expect(fixture.writes).toEqual([]);
});
test('assessment editor protects typed definitions and disables incompatible preview submission', async ({ page }) => {
  const fixture = await openTypedAssessment(page, { role: 'admin' });
  const row = page.getByRole('row', { name: /Проверка знаний/ });
  await row.getByRole('button', { name: /Действия/ }).click();
  await page.getByRole('menuitem', { name: 'Вопросы', exact: true }).click();
  await expect(page).toHaveURL(/\/edit\?tab=questions/);
  await expect(page.getByTestId('assessment-editor-questions')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(typedQuestionMessage)).toBeVisible();
  await expect(page.getByTestId('assessment-editor-questions').getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Добавить вариант/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  await expect(page.getByText(typedQuestionMessage)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Отправить ответы', exact: true })).toHaveCount(0);
  expect(fixture.writes).toEqual([]);
});
