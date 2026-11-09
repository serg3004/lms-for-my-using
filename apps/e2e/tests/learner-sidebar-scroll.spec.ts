import { expect, test } from '@playwright/test';

test.describe('learner sidebar stays in place while the page scrolls (PR 452)', () => {
  for (const [width, height] of [[1280, 700], [1280, 500], [900, 700]]) {
    test(`the sidebar keeps the top of the window and the whole window height at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.route('**/api/v1/**', async (route) => {
        const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
        if (path === '/auth/me') return route.fulfill({ json: { id: 'learner', organizationId: 'org', email: 'l@example.invalid', firstName: 'Lena', lastName: 'Learner', roles: ['learner'], status: 'active', locale: 'ru', timezone: 'UTC' } });
        if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
        if (path === '/checklists/free') return route.fulfill({ json: Array.from({ length: 14 }, (_, i) => ({ id: `f${i}`, title: `Лист ${i}`, description: null, itemCount: 3, pinned: false, activeInstanceId: null, activeInstanceStatus: null })) });
        return route.fulfill({ json: path === '/checklist-instances/mine' ? [] : { items: [], total: 0, page: 1, pageSize: 20 } });
      });
      await page.goto('/learn/checklists');
      await expect(page.getByText('Лист 13').first()).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
      const box = await page.locator('.learner-sidebar').evaluate((el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
      expect(box.top).toBe(0);
      expect(box.bottom).toBe(height);
      // One vertical scrollbar (the window) and no sideways scrolling.
      expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).toBe('visible');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});
