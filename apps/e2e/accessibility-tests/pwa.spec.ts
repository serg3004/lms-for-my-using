import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const organizationId = '55555555-5555-4555-8555-555555555555';

test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });

for (const width of [375, 1440]) {
  test(`the install hint is accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      if (path === '/auth/me') return route.fulfill({ json: { id: 'observer-9', organizationId, email: 'mentor@example.invalid', firstName: 'Test', lastName: 'Observer', middleName: null, position: null, shift: null, phone: null, status: 'active', locale: 'en', timezone: 'Asia/Almaty', roles: ['mentor'] } });
      if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
      if (path === '/checklists/analytics') return route.fulfill({ json: { assignmentsTotal: 0, counts: { completed: 0, expired: 0 }, passRate: 0, pendingReview: 0 } });
    if (path === '/checklist-sessions/to-conduct') return route.fulfill({ json: { items: [], page: 1, pageSize: 100, total: 0 } });
      return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } });
    });
    await page.goto('/mentor');
    await expect(page.getByRole('heading', { name: 'Install to your home screen' })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  });
}
