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
test('legacy author form protects typed definitions and disables incompatible preview submission', async ({ page }) => {
  const fixture = await openTypedAssessment(page, { role: 'admin' });
  await page.getByRole('button', { name: 'Вопросы', exact: true }).click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /— Вопросы/ }) });
  await expect(dialog.getByText(typedQuestionMessage)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Редактировать', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: /Добавить вариант/ })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  await expect(page.getByRole('dialog').getByText(typedQuestionMessage)).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Отправить ответы', exact: true })).toHaveCount(0);
  expect(fixture.writes).toEqual([]);
});
