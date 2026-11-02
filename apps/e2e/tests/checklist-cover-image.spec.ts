import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

// A real 1x1 PNG, so the browser has to decode what the API serves.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test.describe('checklist picture is served by the API (PR 400)', () => {
  test('a pinned tile shows the picture through a blob: URL and never asks the storage', async ({ page }) => {
    const requests: string[] = [];
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      requests.push(path);
      if (path === '/auth/me') return route.fulfill({ json: { id: 'learner', organizationId: 'org', email: 'l@example.invalid', firstName: 'Lena', lastName: 'Learner', roles: ['learner'], status: 'active', locale: 'ru', timezone: 'UTC' } });
      if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
      if (path === '/checklists/free') return route.fulfill({ json: [{ id: 'c1', title: 'Лист с картинкой', description: null, itemCount: 2, pinned: true, activeInstanceId: null, activeInstanceStatus: null, coverUpdatedAt: '2026-10-27T10:00:00.000Z' }] });
      if (path === '/checklists/c1/cover/file') return route.fulfill({ status: 200, contentType: 'image/png', headers: { ETag: '"1"', 'Cache-Control': 'private, no-cache' }, body: png });
      return route.fulfill({ json: path === '/checklist-instances/mine' ? [] : { items: [], total: 0, page: 1, pageSize: 20 } });
    });
    await page.goto('/learn/checklists');
    const tile = page.getByRole('region', { name: 'Закреплённые листы' });
    const image = tile.getByRole('img', { name: /Лист с картинкой/ });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await image.getAttribute('src')).toMatch(/^blob:/);
    expect(requests).toContain('/checklists/c1/cover/file');
    expect(requests).not.toContain('/checklists/c1/cover');
  });

  test('the page policy still allows no storage images beyond what it had', async () => {
    const config = readFileSync(new URL('../../../infra/nginx/security-headers.conf', import.meta.url), 'utf8');
    expect(config).toContain("img-src 'self' data: blob: https:");
  });

  test('the web proxy lets uploads through up to the API limit (a 1.2 MB PNG used to get 413)', async () => {
    const config = readFileSync(new URL('../../../infra/nginx/nginx.conf', import.meta.url), 'utf8');
    const api = config.slice(config.indexOf('location /api/'));
    const limit = /client_max_body_size\s+(\d+)m;/.exec(api.slice(0, api.indexOf('}')));
    expect(limit, 'the /api/ location must set client_max_body_size').not.toBeNull();
    // MAX_BUFFERED_UPLOAD_SIZE_BYTES is 8 MB; the proxy must not be stricter than the API.
    expect(Number(limit![1])).toBeGreaterThanOrEqual(8);
  });
});
