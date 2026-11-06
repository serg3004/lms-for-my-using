import { expect, test } from '@playwright/test';
import { finishResultPreview, openCompletedResultPreview, openResultEditor } from '../fixtures/checklist-learner-result.js';

for (const width of [320, 1440]) test(`learner preview hides the live result and defaults to percent; the shared setting enables points at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const { dialog, result, saved } = await openCompletedResultPreview(page);
  await expect(result).toContainText('100%'); await expect(result).toContainText('Зачтено');
  await expect(result).not.toContainText('6 / 6');
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).last().click();
  await page.getByRole('checkbox', { name: 'Показывать сотруднику баллы', exact: true }).check();
  await page.getByRole('button', { name: 'Сохранить', exact: true }).first().click();
  await expect.poll(() => saved()?.showPointsToLearner).toBe(true);
  const enabled = await finishResultPreview(page);
  await expect(enabled.result).toContainText('6 / 6 (100%)');
  await expect.poll(() => enabled.dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
});

for (const [locale, label] of [['en', 'Show points to the employee'], ['kk', 'Қызметкерге ұпайларды көрсету'], ['zh', '向员工显示分数']]) test(`learner points default off in ${locale}`, async ({ page }) => {
  await openResultEditor(page, locale);
  await expect(page.getByRole('checkbox', { name: label, exact: true })).not.toBeChecked();
});
