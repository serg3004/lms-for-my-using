import { expect, test, type Page } from '@playwright/test';

const organizationId = '55555555-5555-4555-8555-555555555555';

function row(id: string, status: string, learner: string) {
  return {
    id, organizationId, instanceId: `instance-${id}`, observerId: 'observer-1', status, version: 1,
    scheduledAt: '2026-03-08T07:30:00.000Z', durationMinutes: null, startedAt: null, pausedAt: null, locationCapturePolicy: 'off',
    timezone: 'UTC', overdue: false, strengths: null, developmentAreas: null, nextSteps: null,
    observerUnavailableReason: null, observerUnavailableAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    checklist: { id: 'checklist-1', title: 'Safety training' },
    learner: { id: `learner-${id}`, firstName: learner, lastName: 'Learner', email: `${id}@example.invalid` },
    observer: { id: 'observer-1', firstName: 'Olga', lastName: 'Observer', email: 'observer@example.invalid' },
    result: { instanceStatus: 'assigned', percentage: null, passed: null, scored: null, visible: true },
  };
}

async function openSessions(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: { id: 'admin', organizationId, email: 'admin@example.invalid', firstName: 'Test', lastName: 'Admin', middleName: null, position: null, shift: null, phone: null, status: 'active', locale: 'ru', timezone: 'UTC', roles: ['admin'] } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/departments') return route.fulfill({ json: { items: [], page: 1, pageSize: 100, total: 0 } });
    if (path === '/checklist-sessions') {
      const items = [row('s1', 'scheduled', 'Alex'), row('s2', 'completed', 'Boris'), row('s3', 'in_progress', 'Vera')];
      return route.fulfill({ json: { items, page: 1, pageSize: 20, total: items.length } });
    }
    return route.fulfill({ json: path === '/checklists' ? [] : { items: [], total: 0, page: 1, pageSize: 20 } });
  });
  await page.goto('/admin/checklists/sessions');
  await expect(page.getByText('Alex Learner').first()).toBeVisible();
}

test.describe('sessions list: search field and actions column (PR 399)', () => {
  for (const width of [1280, 390]) {
    test(`search text clears the magnifier and actions line up at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openSessions(page);

      const search = page.locator('.admin-session-filters__search');
      const icon = await search.locator('.ds-search__icon').boundingBox();
      const padding = await search.locator('input').evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
      const field = await search.locator('input').boundingBox();
      expect(icon && field && field.x + padding).toBeGreaterThanOrEqual((icon?.x ?? 0) + (icon?.width ?? 0));

      // Open sits in the same place and has the same width on every row, whatever the status.
      const boxes = await page.locator('.admin-session-actions').evaluateAll((nodes) => nodes.map((node) => {
        const open = node.querySelector('a')!.getBoundingClientRect();
        const menu = node.querySelector('.ds-menu button, [aria-haspopup]')?.getBoundingClientRect();
        return { openLeft: Math.round(open.left), openWidth: Math.round(open.width), menuLeft: menu ? Math.round(menu.left) : null, right: Math.round(node.getBoundingClientRect().right) };
      }));
      expect(boxes).toHaveLength(3);
      expect(new Set(boxes.map((box) => box.openLeft)).size).toBe(1);
      expect(new Set(boxes.map((box) => box.openWidth)).size).toBe(1);
      expect(new Set(boxes.map((box) => box.right)).size).toBe(1);
      expect(new Set(boxes.map((box) => box.menuLeft).filter((value) => value !== null)).size).toBe(1);
    });
  }
});
