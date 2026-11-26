import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fakeRecorder, openVoiceConduct } from '../fixtures/checklist-voice.js';

// PR 510: recording and listening in the comment of a criterion (the microphone and the encoder are fakes).
test.describe('voice recording in the comment (PR 510)', () => {
  test.beforeEach(async ({ page }) => { await page.addInitScript(fakeRecorder); });

  test('records, listens, sends, and the recording stands in for a required explanation', async ({ page }) => {
    const server = await openVoiceConduct(page);
    // Without a comment or a recording the answer waits for the explanation.
    await page.getByRole('radio', { name: 'Да', exact: true }).click();
    expect(server.calls).not.toContain('answer');
    await page.getByRole('button', { name: 'Записать звук' }).click();
    await expect(page.getByRole('button', { name: 'Остановить запись' })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(500); // a recording shorter than 0.3 s is refused
    await page.getByRole('button', { name: 'Остановить запись' }).click();
    await expect(page.getByLabel('Новая запись, ещё не отправлена')).toBeVisible();
    await expect(page.getByRole('note').filter({ hasText: 'сохраняется в чек-листе' })).toBeVisible();
    await page.getByRole('button', { name: 'Отправить' }).click();
    await expect(page.getByLabel(/Запись голоса 1/)).toBeVisible();
    await expect(page.getByRole('combobox', { name: /Скорость воспроизведения записи 1/ })).toBeVisible();
    // The held answer can now be saved without typed text.
    const save = page.getByRole('button', { name: 'Сохранить пояснение' });
    await expect(save).toBeEnabled();
    await save.click();
    await expect.poll(() => server.calls).toContain('answer');
  });

  test('a failed upload keeps the recording and can be retried; a recording can be deleted', async ({ page }) => {
    const server = await openVoiceConduct(page, { failUpload: 'offline' });
    await page.getByRole('radio', { name: 'Да', exact: true }).click();
    await page.getByRole('button', { name: 'Записать звук' }).click();
    await page.waitForTimeout(500); // a recording shorter than 0.3 s is refused
    await page.getByRole('button', { name: 'Остановить запись' }).click();
    await page.getByRole('button', { name: 'Отправить' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Нет соединения' })).toBeVisible();
    await page.getByRole('button', { name: 'Отправить' }).click();
    await expect(page.getByLabel(/Запись голоса 1/)).toBeVisible();
    await page.getByRole('button', { name: 'Удалить запись 1' }).click();
    await expect(page.getByLabel(/Запись голоса 1/)).toHaveCount(0);
    expect(server.calls).toEqual(['upload', 'upload', 'delete']);
  });

  test('a refused microphone is explained and can be retried', async ({ page }) => {
    await openVoiceConduct(page);
    await page.evaluate(() => { (window as unknown as { __voice: { denied: boolean } }).__voice.denied = true; });
    await page.getByRole('radio', { name: 'Да', exact: true }).click();
    await page.getByRole('button', { name: 'Записать звук' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Нет доступа к микрофону' })).toBeVisible();
    await page.evaluate(() => { (window as unknown as { __voice: { denied: boolean } }).__voice.denied = false; });
    await page.getByRole('button', { name: 'Повторить' }).click();
    await expect(page.getByRole('button', { name: 'Остановить запись' })).toBeVisible();
  });

  test('the controls are at least 44 px and meet WCAG on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openVoiceConduct(page, { notes: 1 });
    await page.getByRole('radio', { name: 'Да', exact: true }).click();
    for (const control of [page.getByRole('button', { name: 'Записать звук' }), page.getByRole('button', { name: 'Удалить запись 1' }), page.getByRole('combobox', { name: /Скорость воспроизведения/ })]) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const scan = await new AxeBuilder({ page }).include('[role="group"][aria-label="Записи голоса"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(scan.violations).toEqual([]);
  });

  test('without a recorder in the browser the button is not drawn', async ({ page }) => {
    await page.addInitScript(() => { delete (window as unknown as Record<string, unknown>).MediaRecorder; });
    await openVoiceConduct(page);
    await page.getByRole('radio', { name: 'Да', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Записать звук' })).toHaveCount(0);
  });
});

// PR 511: the organization and the checklist decide what is offered; the screen follows what the server says.
test.describe('what is available in the comment (PR 511)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(fakeRecorder);
    // The speech recognition of the browser is a fake that exists, so "Диктовать" is drawn whenever the settings allow it.
    await page.addInitScript(() => { Object.assign(window, { webkitSpeechRecognition: class { start() {} stop() {} abort() {} } }); });
  });

  test('recording off: no "Record sound", dictation stays; saved recordings can still be heard and deleted', async ({ page }) => {
    await openVoiceConduct(page, { notes: 1, settings: { voiceNotes: false } });
    await expect(page.getByLabel(/Запись голоса 1/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Удалить запись 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Записать звук' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Диктовать' })).toBeVisible();
  });

  test('dictation off: no dictation button, the comment field and recording stay', async ({ page }) => {
    await openVoiceConduct(page, { settings: { dictation: false } });
    await expect(page.getByRole('button', { name: 'Диктовать' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Записать звук' })).toBeVisible();
  });

  test('the organization limit of recordings per comment is respected', async ({ page }) => {
    await openVoiceConduct(page, { notes: 1, settings: { perComment: 1 } });
    await expect(page.getByRole('button', { name: 'Записать звук' })).toBeDisabled();
    await expect(page.getByText(/Здесь уже 1 записи/).first()).toBeVisible();
  });

  test('when the settings cannot be read, dictation is offered and recording is not', async ({ page }) => {
    await openVoiceConduct(page, { settingsStatus: 403 });
    await expect(page.getByRole('button', { name: 'Записать звук' })).toHaveCount(0);
  });
});

