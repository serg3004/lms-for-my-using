import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';

// PR 421: extra pictures of a sheet -- upload, caption, order, removal in the builder and the view in the preview.
/** A landscape PNG of the given size, to see how the large view scales a real picture. */
function bigPng(width: number, height: number) {
  const crc = (buffer: Buffer) => { let c, value = 0xffffffff; for (const byte of buffer) { c = (value ^ byte) & 0xff; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; value = (value >>> 8) ^ c; } return (value ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x66)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}
type Photo = { id: string; caption: string; order: number; updatedAt: string };
type Server = { calls: { method: string; path: string; body: unknown }[]; photos: Photo[]; failNext: number };

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function openEditor(page: Page, photoCount = 2): Promise<Server> {
  const server: Server = {
    calls: [], failNext: 0,
    photos: Array.from({ length: photoCount }, (_, index) => ({ id: `p${index + 1}`, caption: `Схема ${index + 1}`, order: index, updatedAt: '2026-11-05T00:00:00.000Z' })),
  };
  const items = [{ id: 'i1', checklistId: 'c1', order: 1, text: 'Включить свет', points: 10, isRequired: true, photoRequired: false, weight: 1, groupId: null, scaleId: null }];
  const checklist = () => ({
    id: 'c1', organizationId: 'org', title: 'Открытие смены', description: 'Перед началом смены', status: 'draft', scoringMode: 'sum_points', passThreshold: 80, scaleLevels: null, requiresReview: false,
    createdBy: 'admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', items, itemGroups: [], contextFields: null, photos: server.photos,
    moduleSettings: { thresholds: null, resultColors: null, feedbackVisibility: null, observers: null, defaultLocationCapturePolicy: null }, hasModuleOverrides: false,
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const method = request.method();
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId: 'org', email: 'admin@example.invalid', firstName: 'Ada', lastName: 'Admin', roles: ['admin'], status: 'active', locale: 'ru', timezone: 'UTC' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    const photoFile = /^\/checklists\/c1\/photos\/([^/]+)\/file$/.exec(path);
    if (photoFile && method === 'GET') return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (/^\/checklists\/c1\/photos/.test(path) && method !== 'GET') {
      const isUpload = method === 'POST';
      server.calls.push({ method, path, body: isUpload ? 'multipart' : (request.postData() ? request.postDataJSON() : null) });
      if (server.failNext > 0) { server.failNext -= 1; return route.fulfill({ status: 500, json: { message: 'Сервер недоступен' } }); }
      if (isUpload) {
        const created = { id: `p${server.photos.length + 1}`, caption: '', order: server.photos.length, updatedAt: '2026-11-05T01:00:00.000Z' };
        server.photos.push(created);
        return route.fulfill({ json: created });
      }
      if (path === '/checklists/c1/photos/order') {
        const ids = (request.postDataJSON() as { ids: string[] }).ids;
        server.photos = ids.map((id, order) => ({ ...server.photos.find((photo) => photo.id === id)!, order }));
        return route.fulfill({ json: server.photos });
      }
      const id = path.split('/').pop()!;
      if (method === 'PATCH') {
        const photo = server.photos.find((entry) => entry.id === id)!;
        photo.caption = (request.postDataJSON() as { caption: string }).caption;
        return route.fulfill({ json: photo });
      }
      server.photos = server.photos.filter((photo) => photo.id !== id).map((photo, order) => ({ ...photo, order }));
      return route.fulfill({ status: 200, body: '' });
    }
    if (path === '/checklists/c1') return route.fulfill({ json: checklist() });
    if (path === '/checklists') return route.fulfill({ json: [checklist()] });
    if (path === '/checklists/c1/groups') return route.fulfill({ json: [] });
    if (path === '/checklist-scales') return route.fulfill({ json: [] });
    return route.fulfill({ json: { items: [], total: 0, count: 0 } });
  });
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto('/admin/checklists');
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await expect(page.getByRole('group', { name: /Изображение на бланке чек-листа/ })).toBeVisible();
  return server;
}

// The caption is a rich single-line field (PR 427): read its visible text.
const captions = (page: Page) => page.getByRole('textbox', { name: /^Подпись к изображению/ }).evaluateAll((fields) => fields.map((field) => field.textContent ?? ''));

test.describe('Extra sheet photos (PR 421)', () => {
  test('shows the saved photos with captions and the counter', async ({ page }) => {
    await openEditor(page);
    await expect(page.getByRole('group', { name: /Изображение на бланке чек-листа/ })).toContainText('(2/6)');
    expect(await captions(page)).toEqual(['Схема 1', 'Схема 2']);
    await expect(page.getByRole('img', { name: /Изображение 1 листа «Открытие смены»/ })).toBeVisible();
  });

  test('PR 433: the images of the form stand right of the thumbnail, one under the other on a phone, with the new names', async ({ page }) => {
    await openEditor(page);
    const thumbnail = page.getByRole('group', { name: 'Миниатюра чек-листа' });
    const images = page.getByRole('group', { name: /Изображение на бланке чек-листа/ });
    await expect(thumbnail).toBeVisible();
    await expect(thumbnail.getByRole('button', { name: /миниатюру/ })).toBeVisible();
    await expect(images.getByRole('button', { name: 'Добавить изображение' })).toBeVisible();
    await expect(page.getByText(/Картинка листа|Дополнительные фото/)).toHaveCount(0);
    const wide = { thumbnail: await thumbnail.boundingBox(), images: await images.boundingBox() };
    expect(wide.images!.x).toBeGreaterThan(wide.thumbnail!.x + wide.thumbnail!.width - 1);
    expect(Math.abs(wide.images!.y - wide.thumbnail!.y)).toBeLessThan(4);
    await page.setViewportSize({ width: 390, height: 1400 });
    const narrow = { thumbnail: await thumbnail.boundingBox(), images: await images.boundingBox() };
    expect(narrow.images!.y).toBeGreaterThan(narrow.thumbnail!.y + narrow.thumbnail!.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('uploads a photo (type checked first), saves a caption, reorders with arrows and removes after confirmation', async ({ page }) => {
    const server = await openEditor(page);
    await page.getByLabel('Файл изображения').setInputFiles({ name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') });
    await expect(page.getByRole('alert')).toContainText('JPEG');
    expect(server.calls).toHaveLength(0);

    await page.getByLabel('Файл изображения').setInputFiles({ name: 'scheme.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByLabel('Подпись к изображению 3')).toBeVisible();
    expect(server.calls.map((call) => `${call.method} ${call.path}`)).toEqual(['POST /checklists/c1/photos']);

    const caption = page.getByLabel('Подпись к изображению 3');
    await caption.fill('Выход эвакуации');
    await caption.blur();
    await expect.poll(() => server.calls.find((call) => call.method === 'PATCH')?.body).toEqual({ caption: 'Выход эвакуации' });

    await page.getByRole('button', { name: 'Изображение 3 выше' }).click();
    await expect.poll(() => server.calls.find((call) => call.path.endsWith('/order'))?.body).toEqual({ ids: ['p1', 'p3', 'p2'] });
    expect(await captions(page)).toEqual(['Схема 1', 'Выход эвакуации', 'Схема 2']);

    await page.getByRole('button', { name: 'Удалить изображение 1' }).click();
    expect(server.calls.some((call) => call.method === 'DELETE')).toBe(false);
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect.poll(() => server.calls.find((call) => call.method === 'DELETE')?.path).toBe('/checklists/c1/photos/p1');
    await expect.poll(() => captions(page)).toEqual(['Выход эвакуации', 'Схема 2']);
  });

  test('a failed reorder puts the list back and says so', async ({ page }) => {
    const server = await openEditor(page);
    server.failNext = 1;
    await page.getByRole('button', { name: 'Изображение 2 выше' }).click();
    await expect(page.getByRole('alert')).toContainText('Сервер недоступен');
    expect(await captions(page)).toEqual(['Схема 1', 'Схема 2']);
  });

  test('six photos is the limit: "Добавить изображение" is disabled', async ({ page }) => {
    await openEditor(page, 6);
    await expect(page.getByRole('button', { name: 'Добавить изображение' })).toBeDisabled();
    await expect(page.getByRole('group', { name: /Изображение на бланке чек-листа/ })).toContainText('Загружено максимум изображений: 6.');
  });

  test('the preview shows the photos under the description; a tap opens one large, Esc closes it', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Предпросмотр' }).click();
    const preview = page.locator('dialog.admin-preview-overlay');
    await expect(preview.getByRole('heading', { name: 'Изображение на бланке чек-листа' })).toBeAttached();
    await expect(preview.getByRole('img', { name: /Изображение 2 листа/ })).toBeVisible();
    await preview.getByRole('button', { name: 'Открыть изображение 2 крупно' }).click();
    const large = page.locator('dialog.ds-dialog[open]');
    await expect(large.getByRole('heading', { name: 'Схема 2' })).toBeVisible();
    await expect(large.getByRole('img', { name: /Изображение 2 листа/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.ds-dialog[open]')).toHaveCount(0);
    await expect(preview).toBeVisible();
  });

  // PR 437: the box beside the heading of the images block hides the strip when the sheet is filled in; the editor keeps the images.
  test('"Показывать изображения на чек-листе": unticked, the preview has no images but the editor keeps them; ticked again, they are back', async ({ page }) => {
    await openEditor(page);
    const box = page.getByRole('checkbox', { name: 'Показывать изображения на чек-листе' });
    await expect(box).toBeChecked();
    expect((await box.boundingBox())!.width).toBeLessThanOrEqual(24);
    await box.uncheck();
    await expect(page.getByText('Изображения не видны при заполнении листа.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Изображение 1 ниже' })).toBeVisible();
    await page.getByRole('button', { name: 'Предпросмотр' }).click();
    const preview = page.locator('dialog.admin-preview-overlay');
    await expect(preview.getByRole('heading', { name: 'Открытие смены' })).toBeVisible();
    await expect(preview.getByRole('heading', { name: 'Изображение на бланке чек-листа' })).toHaveCount(0);
    await expect(preview.getByRole('img', { name: /Изображение 2 листа/ })).toHaveCount(0);
    await preview.getByRole('button', { name: 'Закрыть' }).first().click();
    await box.check();
    await expect(page.getByText('Изображения не видны при заполнении листа.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Предпросмотр' }).click();
    await expect(page.locator('dialog.admin-preview-overlay').getByRole('img', { name: /Изображение 2 листа/ })).toBeVisible();
  });

  for (const width of [320, 390]) {
    test(`${width} px: the photo list and the preview do not scroll horizontally, controls are at least 44 px`, async ({ page }) => {
      await openEditor(page);
      await page.setViewportSize({ width, height: 900 });
      const arrow = page.getByRole('button', { name: 'Изображение 1 ниже' });
      await arrow.scrollIntoViewIfNeeded();
      const box = await arrow.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(43.5);
      expect(box!.height).toBeGreaterThanOrEqual(43.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.getByRole('button', { name: 'Предпросмотр' }).click();
      await expect(page.locator('dialog.admin-preview-overlay').getByRole('heading', { name: 'Изображение на бланке чек-листа' })).toBeAttached();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const overlay = page.locator('dialog.admin-preview-overlay .admin-preview-panel');
      expect(await overlay.evaluate((panel) => panel.scrollWidth <= panel.clientWidth + 1)).toBe(true);
    });
  }

  // PR 445: the pictures come first and carry no visible heading; the large view takes the screen.
  for (const [width, height] of [[1280, 800], [390, 780]] as const) {
    test(`PR 445: ${width} px: the images are above the title without a visible heading, and the large view fits the screen`, async ({ page }) => {
      await openEditor(page);
      await page.setViewportSize({ width, height });
      await page.getByRole('button', { name: 'Предпросмотр' }).click();
      const preview = page.locator('dialog.admin-preview-overlay');
      const heading = await preview.getByRole('heading', { name: 'Изображение на бланке чек-листа' }).boundingBox();
      expect(heading!.width).toBeLessThanOrEqual(2); expect(heading!.height).toBeLessThanOrEqual(2);
      const strip = (await preview.getByRole('button', { name: 'Открыть изображение 1 крупно' }).boundingBox())!;
      const title = (await preview.getByRole('heading', { name: 'Открытие смены' }).boundingBox())!;
      expect(strip.y).toBeLessThan(title.y);
      await page.route(/\/checklists\/c1\/photos\/[^/]+\/file/, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: bigPng(1600, 800) }));
      await preview.getByRole('button', { name: 'Открыть изображение 1 крупно' }).click();
      const large = page.locator('dialog.ds-dialog[open]');
      await expect(large.getByRole('img')).toHaveJSProperty('naturalWidth', 1600);
      const box = (await large.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(-0.5); expect(box.y).toBeGreaterThanOrEqual(-0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5); expect(box.y + box.height).toBeLessThanOrEqual(height + 0.5);
      if (width > 640) expect(box.width).toBeGreaterThanOrEqual(Math.min(width * 0.96, 1200) - 2);
      else { expect(box.width).toBeGreaterThanOrEqual(width - 1); expect(box.height).toBeGreaterThanOrEqual(height - 1); }
      // The picture itself is large (a 2:1 picture fills the width up to the screen height) and never leaves the box.
      const picture = (await large.getByRole('img').boundingBox())!;
      expect(picture.x).toBeGreaterThanOrEqual(box.x - 0.5); expect(picture.x + picture.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
      expect(picture.y + picture.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
      expect(picture.width).toBeGreaterThanOrEqual(width > 640 ? 800 : width - 30);
      const close = (await large.getByRole('button', { name: 'Закрыть' }).boundingBox())!;
      expect(close.width).toBeGreaterThanOrEqual(43.5); expect(close.height).toBeGreaterThanOrEqual(43.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await large.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);
    });
  }
  test('a caption is centered until another alignment is chosen; "left" is stored explicitly (PR 455)', async ({ page }) => {
    const server = await openEditor(page, 1);
    const field = page.getByRole('textbox', { name: /^Подпись к изображению 1/ });
    await expect(field.locator('p').first()).toHaveCSS('text-align', 'center');
    await field.click();
    await page.keyboard.press('ControlOrMeta+Shift+L');
    await expect(field.locator('p').first()).not.toHaveCSS('text-align', 'center');
    await field.blur();
    await expect.poll(() => server.calls.find((call) => call.method === 'PATCH')?.body).toEqual({ caption: '<p style="text-align:left">Схема 1</p>' });
  });
});
