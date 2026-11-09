import { expect, test } from '@playwright/test';

const cover = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#bfdbfe"/></svg>';
const free = [
  { id: 'a', title: 'Открытие смены', description: null, itemCount: 12, pinned: true, coverUpdatedAt: '2026-10-27T10:00:00.000Z', activeInstanceId: null, activeInstanceStatus: null },
  { id: 'b', title: 'Закрытие смены с очень длинным названием, которое переносится на несколько строк в карточке', description: null, itemCount: 7, pinned: true, activeInstanceId: 'i2', activeInstanceStatus: 'in_progress' },
  { id: 'c', title: 'Касса', description: null, itemCount: 7, pinned: true, activeInstanceId: null, activeInstanceStatus: null },
];

test.describe('pinned checklist tiles (PR 451)', () => {
  for (const width of [1280, 768, 390]) {
    test(`tiles of one row are equally tall and never overlap the next block at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.route('**/api/v1/**', async (route) => {
        const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
        if (path === '/auth/me') return route.fulfill({ json: { id: 'learner', organizationId: 'org', email: 'l@example.invalid', firstName: 'Lena', lastName: 'Learner', roles: ['learner'], status: 'active', locale: 'ru', timezone: 'UTC' } });
        if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
        if (path === '/checklists/free') return route.fulfill({ json: free });
        if (path.endsWith('/cover/file')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: cover });
        return route.fulfill({ json: path === '/checklist-instances/mine' ? [] : { items: [], total: 0, page: 1, pageSize: 20 } });
      });
      await page.goto('/learn/checklists');
      const tiles = page.getByRole('region', { name: 'Закреплённые листы' });
      await expect(tiles.getByRole('listitem')).toHaveCount(3);
      const boxes = await tiles.getByRole('listitem').evaluateAll((items) => items.map((li) => {
        const card = li.firstElementChild as HTMLElement;
        const l = li.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        return { top: Math.round(l.top), bottom: Math.round(l.bottom), cardTop: Math.round(c.top), cardBottom: Math.round(c.bottom), left: Math.round(l.left), right: Math.round(l.right) };
      }));
      // The card fills its list item, so cards in the same row end at the same line.
      for (const box of boxes) expect(Math.abs(box.cardBottom - box.bottom)).toBeLessThanOrEqual(1);
      const rows = new Map<number, number[]>();
      for (const box of boxes) rows.set(box.top, [...(rows.get(box.top) ?? []), box.cardBottom]);
      for (const bottoms of rows.values()) expect(new Set(bottoms).size).toBe(1);
      // Nothing overlaps the following block and nothing sticks out sideways.
      const lastBottom = Math.max(...boxes.map((box) => box.bottom));
      const nextTop = await page.getByRole('tab', { name: /Назначенные/ }).evaluate((el) => Math.round(el.getBoundingClientRect().top));
      expect(nextTop).toBeGreaterThan(lastBottom);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});
