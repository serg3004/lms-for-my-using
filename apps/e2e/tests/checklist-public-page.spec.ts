import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, GOOD_CODE, openPublicPage, PUBLIC_TOKEN } from '../fixtures/checklist-public-page.js';

// PR 467: `/c/:token`, the page a person reaches by the link or the QR code.

test('a guest passes the sheet from the link and sends it, and the page remembers the pass', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const log = await openPublicPage(page);
  await expect(page.getByRole('heading', { name: 'Приёмка 5S', level: 1 })).toBeVisible();
  // No application menu, and search engines are told to leave the page alone.
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expectNoHorizontalScroll(page);

  await page.getByLabel('Ваше имя').fill('Айдос Нурланов');
  await page.getByLabel('Код с картинки').fill(GOOD_CODE);
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await expect(page.getByText('Проходы свободны')).toBeVisible();
  expect(log.starts).toEqual([{ guestName: 'Айдос Нурланов', captchaChallenge: expect.stringMatching(/^challenge-\d+$/), captchaCode: GOOD_CODE }]);
  await expect(page.getByRole('link', { name: 'Все чек-листы' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await page.getByRole('radio', { name: /^Да/ }).nth(0).click();
  await page.getByRole('radio', { name: /^Да/ }).nth(1).click();
  expect(log.answers.map((a) => [a.itemId, a.body.checked, a.passKey])).toEqual([['it1', true, 'pass-key-1'], ['it2', true, 'pass-key-1']]);

  // Sending needs the code from a new picture.
  await page.getByRole('button', { name: 'Завершить проверку' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Завершить проверку' }).click();
  await expect(page.getByRole('alert')).toHaveText('Введите код с картинки.');
  await page.getByLabel('Код с картинки').fill('WRONG');
  await page.getByRole('button', { name: 'Завершить проверку' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Завершить проверку' }).click();
  await expect(page.getByRole('alert')).toHaveText('Код неверный. Введите символы с новой картинки.');
  await expect(page.getByLabel('Код с картинки')).toHaveValue('');
  await page.getByLabel('Код с картинки').fill(GOOD_CODE);
  await page.getByRole('button', { name: 'Завершить проверку' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Завершить проверку' }).click();
  await expect(page.getByRole('heading', { name: 'Спасибо!' })).toBeVisible();
  expect(log.finishes.map((f) => f.captchaCode)).toEqual(['WRONG', GOOD_CODE]);
  await expectNoHorizontalScroll(page);

  // A reload shows the thanks again, and "Пройти ещё раз" starts a fresh pass.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Спасибо!' })).toBeVisible();
  await page.getByRole('button', { name: 'Пройти ещё раз' }).click();
  await expect(page.getByLabel('Ваше имя')).toBeVisible();
});

test('a wrong code at the start is explained and a new picture is asked for', async ({ page }) => {
  const log = await openPublicPage(page, { guestNameRequired: false });
  await expect(page.getByText('Ваше имя (необязательно)')).toBeVisible();
  await expect(page.getByRole('img', { name: /Картинка с кодом/ })).toBeVisible();
  const before = log.captchas;
  await page.getByLabel('Код с картинки').fill('NOPE1');
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Код неверный. Введите символы с новой картинки.');
  await expect.poll(() => log.captchas).toBeGreaterThan(before);
  await expect(page.getByLabel('Код с картинки')).toHaveValue('');
  await page.getByLabel('Код с картинки').fill(GOOD_CODE);
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await expect(page.getByText('Проходы свободны')).toBeVisible();
});

test('a required name is asked for before anything is sent', async ({ page }) => {
  const log = await openPublicPage(page);
  await page.getByLabel('Код с картинки').fill(GOOD_CODE);
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Введите своё имя, чтобы начать.');
  expect(log.starts).toEqual([]);
});

test('registered only: a visitor who is not signed in is sent to sign in', async ({ page }) => {
  await page.route('**/api/v1/auth/**', (route) => route.fulfill({ status: 401, json: { statusCode: 401, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' }, path: '/', timestamp: '2026-11-11T00:00:00.000Z' } }));
  await openPublicPage(page, { mode: 'registered' });
  await expect(page).toHaveURL(/\/login$/);
});

test('a link that was switched off or replaced shows one clear page', async ({ page }) => {
  await openPublicPage(page, { mode: 'off' });
  await expect(page.getByRole('heading', { name: 'Эта ссылка не работает' })).toBeVisible();
  await expect(page.getByLabel('Ваше имя')).toHaveCount(0);
});

test('a sheet that needs photos says up front that guests may not attach them', async ({ page }) => {
  await openPublicPage(page, { photoRequiredCount: 1, guestPhotosAllowed: false });
  await expect(page.getByText('владелец не разрешил фото для гостей')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Начать', exact: true })).toBeDisabled();
});

test.describe('the language of the phone', () => {
  test.use({ locale: 'kk-KZ' });
  test('the page follows the browser language when the guest has not chosen one', async ({ page }) => {
    await openPublicPage(page, { language: null });
    await expect(page.getByRole('button', { name: 'Бастау', exact: true })).toBeVisible();
    await page.getByLabel('Тіл').selectOption('en');
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  });
});

for (const width of [320, 1280]) test(`the front page and the pass fit the screen at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await openPublicPage(page);
  await expectNoHorizontalScroll(page);
  await page.getByLabel('Ваше имя').fill('Очень-очень-длинное-имя-без-пробелов-чтобы-проверить-перенос');
  await page.getByLabel('Код с картинки').fill(GOOD_CODE);
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await expect(page.getByText('Проходы свободны')).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(page.url()).toContain(`/c/${PUBLIC_TOKEN}`);
});
