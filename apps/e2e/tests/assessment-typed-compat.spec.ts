import { expect, test } from '@playwright/test';
import { openTypedAssessment, typedQuestionMessage } from '../fixtures/assessment-typed-compat.js';

for (const type of ['matching', 'ordering', 'fill_blank', 'short_answer', 'true_false']) test(`taking form rejects malformed ${type} without starting a timed attempt`, async ({ page }) => {
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
test('the author edits a typed question and previews its response controls', async ({ page }) => {
  const fixture = await openTypedAssessment(page, { role: 'admin' });
  const row = page.getByRole('row', { name: /Проверка знаний/ });
  await row.getByRole('button', { name: /Действия/ }).click();
  await page.getByRole('menuitem', { name: 'Вопросы', exact: true }).click();
  await expect(page).toHaveURL(/\/edit\?tab=questions/);
  const questions = page.getByTestId('assessment-editor-questions');
  await questions.getByRole('button', { name: 'Редактировать' }).click();
  await questions.getByLabel(/^Название вопроса/).fill('Порядок действий при проверке');
  await questions.getByRole('button', { name: 'С этого вопроса' }).click();
  await expect(page.getByRole('heading', { name: 'Порядок действий при проверке' })).toBeVisible();
  await expect(page.locator('.learner-quiz__question select')).toHaveCount(2);
  expect(fixture.writes).toEqual([]);
});
