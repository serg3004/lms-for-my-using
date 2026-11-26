import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { fakeRecorder } from '../fixtures/checklist-voice.js';
import { fakeRecognition, openReviewVoice } from '../fixtures/checklist-review-voice.js';

// PR 512: the reviewer dictates and records a comment on an answer, and hears what the learner recorded.
test.describe('dictation and sound in the reviewer comment (PR 512)', () => {
  test.beforeEach(async ({ page }) => { await page.addInitScript(fakeRecorder); await page.addInitScript(fakeRecognition); });

  test('the reviewer hears the learner, dictates a comment and records their own, and the decision carries the text', async ({ page }) => {
    const server = await openReviewVoice(page);
    await expect(page.getByLabel(/Запись голоса 1/)).toBeVisible();
    await page.getByRole('button', { name: 'Диктовать' }).click();
    await page.evaluate(() => (window as unknown as { __say: (text: string, isFinal: boolean) => void }).__say('Нужна фотография', true));
    await page.getByRole('button', { name: 'Остановить' }).click();
    await expect(page.getByRole('textbox', { name: 'Комментарий (необязательно)' })).toHaveValue('Нужна фотография');
    await page.getByRole('button', { name: 'Записать звук' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Остановить запись' }).click();
    await page.getByRole('button', { name: 'Отправить' }).click();
    await expect(page.getByLabel(/Запись голоса 1/)).toHaveCount(2);
    expect(server.calls).toContainEqual({ kind: 'upload', body: { place: 'reviewer_comment' } });
    await page.getByRole('button', { name: 'Подтвердить' }).click();
    await expect.poll(() => server.calls.find((call) => call.kind === 'review')?.body).toMatchObject({ status: 'approved', comment: 'Нужна фотография' });
  });

  test('the controls are at least 44 px and meet WCAG on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openReviewVoice(page);
    for (const control of [page.getByRole('button', { name: 'Диктовать' }), page.getByRole('button', { name: 'Записать звук' })]) {
      expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const scan = await new AxeBuilder({ page }).include('[role="group"][aria-label="Записи голоса"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(scan.violations).toEqual([]);
  });
});
