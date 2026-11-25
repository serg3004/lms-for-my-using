import { expect, test } from '@playwright/test';
import { fakeRecorder, openVoiceConduct } from '../fixtures/checklist-voice.js';

// PR 510: the voice controls under the comment, with saved recordings and while listening to a new one.
for (const width of [375, 1024]) {
  test(`voice recordings of a comment at ${width}px`, async ({ page }) => {
    await page.addInitScript(fakeRecorder);
    await page.setViewportSize({ width, height: 900 });
    await openVoiceConduct(page, { notes: 2 });
    await page.getByRole('radio', { name: 'Да', exact: true }).click();
    await page.getByRole('button', { name: 'Записать звук' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Остановить запись' }).click();
    await expect(page.getByLabel('Новая запись, ещё не отправлена')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Записи голоса' })).toHaveScreenshot(`voice-notes-${width}.png`);
  });
}
