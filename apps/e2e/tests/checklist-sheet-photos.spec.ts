import { expect, test, type Page } from '@playwright/test';

// PR 421: extra pictures of a sheet -- upload, caption, order, removal in the builder and the view in the preview.
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
  await expect(page.getByRole('group', { name: /Дополнительные фото/ })).toBeVisible();
  return server;
}

const captions = (page: Page) => page.locator('input[aria-label^="Подпись к фото"]').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

test.describe('Extra sheet photos (PR 421)', () => {
  test('shows the saved photos with captions and the counter', async ({ page }) => {
    await openEditor(page);
    await expect(page.getByRole('group', { name: /Дополнительные фото/ })).toContainText('(2/6)');
    expect(await captions(page)).toEqual(['Схема 1', 'Схема 2']);
    await expect(page.getByRole('img', { name: /Фото 1 листа «Открытие смены»/ })).toBeVisible();
  });

  test('uploads a photo (type checked first), saves a caption, reorders with arrows and removes after confirmation', async ({ page }) => {
    const server = await openEditor(page);
    await page.getByLabel('Файл фото').setInputFiles({ name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') });
    await expect(page.getByRole('alert')).toContainText('JPEG');
    expect(server.calls).toHaveLength(0);

    await page.getByLabel('Файл фото').setInputFiles({ name: 'scheme.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByLabel('Подпись к фото 3')).toBeVisible();
    expect(server.calls.map((call) => `${call.method} ${call.path}`)).toEqual(['POST /checklists/c1/photos']);

    const caption = page.getByLabel('Подпись к фото 3');
    await caption.fill('Выход эвакуации');
    await caption.blur();
    await expect.poll(() => server.calls.find((call) => call.method === 'PATCH')?.body).toEqual({ caption: 'Выход эвакуации' });

    await page.getByRole('button', { name: 'Фото 3 выше' }).click();
    await expect.poll(() => server.calls.find((call) => call.path.endsWith('/order'))?.body).toEqual({ ids: ['p1', 'p3', 'p2'] });
    expect(await captions(page)).toEqual(['Схема 1', 'Выход эвакуации', 'Схема 2']);

    await page.getByRole('button', { name: 'Удалить фото 1' }).click();
    expect(server.calls.some((call) => call.method === 'DELETE')).toBe(false);
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect.poll(() => server.calls.find((call) => call.method === 'DELETE')?.path).toBe('/checklists/c1/photos/p1');
    expect(await captions(page)).toEqual(['Выход эвакуации', 'Схема 2']);
  });

  test('a failed reorder puts the list back and says so', async ({ page }) => {
    const server = await openEditor(page);
    server.failNext = 1;
    await page.getByRole('button', { name: 'Фото 2 выше' }).click();
    await expect(page.getByRole('alert')).toContainText('Сервер недоступен');
    expect(await captions(page)).toEqual(['Схема 1', 'Схема 2']);
  });

  test('six photos is the limit: "Добавить фото" is disabled', async ({ page }) => {
    await openEditor(page, 6);
    await expect(page.getByRole('button', { name: 'Добавить фото' })).toBeDisabled();
    await expect(page.getByRole('group', { name: /Дополнительные фото/ })).toContainText('Загружено максимум фото: 6.');
  });

  test('the preview shows the photos under the description; a tap opens one large, Esc closes it', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Предпросмотр' }).click();
    const preview = page.locator('dialog.admin-preview-overlay');
    await expect(preview.getByRole('heading', { name: 'Фото листа' })).toBeVisible();
    await expect(preview.getByRole('img', { name: /Фото 2 листа/ })).toBeVisible();
    await preview.getByRole('button', { name: 'Открыть фото 2 крупно' }).click();
    const large = page.locator('dialog.ds-dialog[open]');
    await expect(large.getByRole('heading', { name: 'Схема 2' })).toBeVisible();
    await expect(large.getByRole('img', { name: /Фото 2 листа/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.ds-dialog[open]')).toHaveCount(0);
    await expect(preview).toBeVisible();
  });

  for (const width of [320, 390]) {
    test(`${width} px: the photo list and the preview do not scroll horizontally, controls are at least 44 px`, async ({ page }) => {
      await openEditor(page);
      await page.setViewportSize({ width, height: 900 });
      const arrow = page.getByRole('button', { name: 'Фото 1 ниже' });
      await arrow.scrollIntoViewIfNeeded();
      const box = await arrow.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(43.5);
      expect(box!.height).toBeGreaterThanOrEqual(43.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.getByRole('button', { name: 'Предпросмотр' }).click();
      await expect(page.locator('dialog.admin-preview-overlay').getByRole('heading', { name: 'Фото листа' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const overlay = page.locator('dialog.admin-preview-overlay .admin-preview-panel');
      expect(await overlay.evaluate((panel) => panel.scrollWidth <= panel.clientWidth + 1)).toBe(true);
    });
  }
});
