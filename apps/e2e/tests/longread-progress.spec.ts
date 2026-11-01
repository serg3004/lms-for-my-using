import { expect, test, type Page } from '@playwright/test';
import { progressReaderServer, continueEditorServer, openContinuePreview } from '../fixtures/longread-progress.js';
async function answer(page: Page, index: number, good: boolean) {
  const block = page.getByRole('region', { name: `Exercise ${index + 1}`, exact: true });
  if (index === 1) for (const option of await block.getByRole('checkbox').all()) await option.uncheck();
  await block.getByLabel(good ? 'Good' : 'Bad', { exact: true }).check(); await block.getByRole('button', { name: 'Проверить ответ', exact: true }).click();
  await expect(block.getByRole('status')).toContainText(good ? '8 / 8' : '0 / 8');
}
test('A and B unlock only their prefixes; refresh retains completion and one chapter finishes once', async ({ page }) => {
  const server = progressReaderServer(); await server.attach(page);
  await expect(page.getByRole('region', { name: 'Exercise 2', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Продолжить', exact: true })).toBeDisabled();
  await answer(page, 0, true); await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Exercise 2', exact: true })).toBeVisible(); await answer(page, 1, false);
  await expect(page.getByText('Есть неверные ответы. Исправьте их и проверьте снова.').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Продолжено', exact: true })).toBeDisabled();
  await page.getByRole('region', { name: 'Exercise 2', exact: true }).getByRole('button', { name: 'Новая попытка', exact: true }).click(); await answer(page, 1, true);
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click(); await page.getByRole('button', { name: 'Завершить главу', exact: true }).click();
  await page.reload(); await expect(page.getByRole('region', { name: 'Состояние прохождения' })).toContainText('50%');
  await page.getByRole('button', { name: 'Следующая глава', exact: true }).click(); await page.getByRole('button', { name: 'Завершить главу', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Готово', exact: true })).toBeVisible(); expect(server.summary().completed).toBe(true);
});
test('shows exhausted attempts distinctly from an unavailable file', async ({ page }) => {
  const server = progressReaderServer({ fileUnavailable: true }); await server.attach(page);
  await answer(page, 0, false); await page.getByRole('region', { name: 'Exercise 1', exact: true }).getByRole('button', { name: 'Новая попытка', exact: true }).click(); await answer(page, 0, false);
  await expect(page.getByRole('region', { name: 'Состояние прохождения' })).toContainText('попытки исчерпаны');
  await expect(page.getByRole('region', { name: 'Состояние прохождения' })).toContainText('Файл недоступен');
});
test('client clock cannot release a timed button; server refresh releases it', async ({ page }) => {
  const server = progressReaderServer({ mode: 'free', seconds: 60 }); await server.attach(page);
  await expect(page.getByRole('button', { name: 'Продолжить', exact: true })).toBeDisabled();
  await page.clock.install(); await page.clock.fastForward(120_000);
  await expect(page.getByRole('button', { name: 'Продолжить', exact: true })).toBeDisabled();
  server.setElapsed(60); await page.getByRole('button', { name: 'Обновить проверку', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Продолжить', exact: true })).toBeEnabled();
});
for (const [locale, name] of [['ru', 'Продолжить'], ['en', 'Continue'], ['kk', 'Жалғастыру'], ['zh', '继续']] as const) test(`${locale}: Continue is localized and keyboard-accessible at 375px`, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 }); const server = progressReaderServer({ mode: 'free' }); await server.attach(page, locale);
  const button = page.getByRole('button', { name, exact: true }); await button.focus(); await button.press('Enter');
  await expect(page.getByRole('region', { name: 'Exercise 2', exact: true })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
for (const role of ['admin', 'instructor'] as const) test(`${role} authors a Continue rule and minimum server time`, async ({ page }) => {
  const server = continueEditorServer(); await server.attach(page, { role });
  await page.getByLabel('Условие продолжения', { exact: true }).selectOption('answered'); await page.getByLabel('Минимум секунд с открытия главы (0 — без ожидания)', { exact: true }).fill('45');
  await expect.poll(() => server.writes.at(-1)?.chapters[0]?.blocks[0]?.content).toEqual({ mode: 'answered', minViewSeconds: 45 });
});
test('author preview never writes a Continue action or learning progress', async ({ page }) => {
  const writes = await openContinuePreview(page); await page.getByRole('dialog').getByRole('button', { name: 'Продолжить', exact: true }).click(); expect(writes).toEqual([]);
});

test('admin report displays the version and the same blocked/file state as the learner', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  const { openProgressReport } = await import('../fixtures/longread-progress.js'); await openProgressReport(page);
  const status = page.getByRole('region', { name: 'Состояние прохождения' }).first(); await expect(status).toContainText('Версия 1'); await expect(status).toContainText('Файл недоступен');
  await expect(status.getByRole('button')).toHaveCount(0);
  expect(await status.evaluate((section) => section.scrollWidth <= section.clientWidth + 1)).toBe(true);
  expect(await status.evaluate((section) => section.getBoundingClientRect().right <= innerWidth)).toBe(true);
});
