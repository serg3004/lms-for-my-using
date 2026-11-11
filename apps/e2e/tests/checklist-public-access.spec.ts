import { expect, test, type Page } from '@playwright/test';
import { openFormattingEditor } from '../fixtures/checklist-formatting.js';
import type { PreviewMock } from '../fixtures/checklist-preview.js';
import { openSettingsTab } from '../fixtures/checklist-settings-tab.js';

// PR 466: «Доступ по ссылке и QR-коду» in the settings of a free, published sheet (administrator).
const TOKEN = 'k3Jf9QxLw2Zp7VbN4mTa8RcYd6HsUe0G';
const NEW_TOKEN = 'Zz8Yy7Xx6Ww5Vv4Uu3Tt2Ss1Rr0Qq9Pp';

type State = { access: 'off' | 'registered' | 'everyone'; guestNameRequired: boolean; guestPhotosAllowed: boolean; dailyLimit: number; changedAt: string | null; token: string | null };

async function openPublicAccess(page: Page, sheetOverrides: Record<string, unknown> = { status: 'published', accessMode: 'free' }, initial: Partial<State> = {}) {
  const state: State = { access: 'off', guestNameRequired: true, guestPhotosAllowed: false, dailyLimit: 200, changedAt: null, token: null, ...initial };
  const requests: Array<{ method: string; body: unknown }> = [];
  // The builder asks for the entry as soon as it opens, so the mock goes in with the fixture's own routes.
  const mock: PreviewMock = async (route, path) => {
    if (!/^\/checklists\/[^/]+\/public-access(\/reissue)?$/.test(path)) return false;
    const request = route.request();
    const body = request.method() === 'GET' ? undefined : request.postDataJSON() as Record<string, unknown> | null;
    requests.push({ method: `${request.method()} ${path.endsWith('/reissue') ? 'reissue' : 'state'}`, body });
    if (request.method() === 'PATCH') {
      const patch = body as Partial<State>;
      if (patch.access && patch.access !== state.access) {
        state.access = patch.access; state.changedAt = new Date().toISOString();
        if (patch.access !== 'off' && !state.token) state.token = TOKEN;
      }
      if (patch.guestPhotosAllowed !== undefined) state.guestPhotosAllowed = patch.guestPhotosAllowed;
      if (patch.guestNameRequired !== undefined) state.guestNameRequired = patch.guestNameRequired;
    }
    if (request.method() === 'POST') { state.token = NEW_TOKEN; state.changedAt = new Date().toISOString(); }
    await route.fulfill({ json: { checklistId: 'preview-sheet', ...state, eligible: true, hasLink: state.token !== null, changedBy: null } });
    return true;
  };
  const { sheet } = await openFormattingEditor(page, 'ru', (draft) => { Object.assign(draft, sheetOverrides); }, mock);
  await openSettingsTab(page);
  return { sheet, state, requests };
}

test('an administrator switches the link on for everyone, copies the link and downloads the QR code', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1280, height: 1000 });
  // An ASCII title: the headless browser of the test run names a download with a non-Latin file name just "download".
  const { requests } = await openPublicAccess(page, { status: 'published', accessMode: 'free', title: 'Receiving 5S' });
  const card = page.getByTestId('public-access-card');
  await expect(card.getByRole('heading', { name: 'Доступ по ссылке и QR-коду' })).toBeVisible();
  await expect(card.getByRole('radio', { name: /Выключен/ })).toBeChecked();
  await expect(page.locator('#checklist-public-link')).toBeHidden();

  await card.getByRole('radio', { name: /Все, даже незарегистрированные/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('любому человеку в интернете');
  expect(requests.some((r) => r.method.startsWith('PATCH'))).toBe(false);
  await dialog.getByRole('button', { name: 'Включить', exact: true }).click();

  await expect(card.getByText('Чек-лист открыт для любого, у кого есть ссылка')).toBeVisible();
  await expect(page.locator('#checklist-public-link')).toHaveValue(new RegExp(`/c/${TOKEN}$`));
  await expect(card.getByTestId('public-access-qr').locator('svg')).toBeVisible();
  await expect(card.getByLabel('Имя гостя')).toBeVisible();

  await card.getByRole('button', { name: 'Скопировать', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Скопировано', exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/c/${TOKEN}$`));

  const [svg] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Скачать SVG', exact: true }).click()]);
  expect(svg.suggestedFilename()).toBe('Receiving-5S-qr.svg');
  const [png] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Скачать PNG', exact: true }).click()]);
  expect(png.suggestedFilename()).toBe('Receiving-5S-qr.png');

  await card.getByRole('checkbox', { name: 'Разрешить гостям прикреплять фото' }).click();
  await expect.poll(() => requests.some((r) => (r.body as { guestPhotosAllowed?: boolean } | null)?.guestPhotosAllowed === true)).toBe(true);
});

test('reissuing the link warns first and shows the new link only after the confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const { requests } = await openPublicAccess(page, { status: 'published', accessMode: 'free' }, { access: 'registered', token: TOKEN, changedAt: '2026-11-01T10:00:00.000Z' });
  const card = page.getByTestId('public-access-card');
  await expect(page.locator('#checklist-public-link')).toHaveValue(new RegExp(TOKEN));
  await card.getByRole('button', { name: 'Перевыпустить ссылку', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('сразу перестанут работать');
  await expect(dialog).toContainText('Это нельзя отменить');
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  expect(requests.some((r) => r.method === 'POST reissue')).toBe(false);
  await expect(page.locator('#checklist-public-link')).toHaveValue(new RegExp(TOKEN));

  await card.getByRole('button', { name: 'Перевыпустить ссылку', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Перевыпустить ссылку', exact: true }).click();
  await expect(page.locator('#checklist-public-link')).toHaveValue(new RegExp(NEW_TOKEN));
});

test('switching off asks first and removes the link', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openPublicAccess(page, { status: 'published', accessMode: 'free' }, { access: 'everyone', token: TOKEN, changedAt: '2026-11-01T10:00:00.000Z' });
  const card = page.getByTestId('public-access-card');
  await card.getByRole('radio', { name: /Выключен/ }).click();
  await expect(page.getByRole('dialog')).toContainText('все напечатанные QR-коды сразу перестанут работать');
  await page.getByRole('dialog').getByRole('button', { name: 'Выключить', exact: true }).click();
  await expect(page.locator('#checklist-public-link')).toBeHidden();
  await expect(card.getByRole('radio', { name: /Выключен/ })).toBeChecked();
});

test('a draft sheet explains that the link comes with publishing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openPublicAccess(page, { status: 'draft', accessMode: 'free' });
  const card = page.getByTestId('public-access-card');
  await expect(card).toContainText('после публикации чек-листа');
  await expect(card.getByRole('radio')).toHaveCount(0);
});

for (const width of [390, 320]) test(`the card fits a phone (${width}px) with the link and the QR code shown`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await openPublicAccess(page, { status: 'published', accessMode: 'free' }, { access: 'everyone', token: TOKEN, changedAt: '2026-11-01T10:00:00.000Z' });
  await expect(page.getByTestId('public-access-qr').locator('svg')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
