import { expect, test, type Page } from '@playwright/test';

const organizationId = '55555555-5555-4555-8555-555555555555';

// PR 357: installing the site on a phone. The browser's own install offer and the iPhone instruction are emulated.
async function mockObserver(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return route.fulfill({ json: {
      id: 'observer-9', organizationId, email: 'mentor@example.invalid', firstName: 'Test', lastName: 'Observer', middleName: null,
      position: null, shift: null, phone: null, status: 'active', locale: 'en', timezone: 'Asia/Almaty', roles: ['mentor'],
    } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/checklists/analytics') return route.fulfill({ json: { assignmentsTotal: 0, counts: { completed: 0, expired: 0 }, passRate: 0, pendingReview: 0 } });
    if (path === '/checklist-sessions/to-conduct') return route.fulfill({ json: { items: [], page: 1, pageSize: 100, total: 0 } });
    return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } });
  });
}

test.describe('install as an app (PR 357)', () => {
  test('the site publishes a valid manifest, its icons and the offline notice', async ({ page, request }) => {
    await page.goto('/login');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    const manifest = await (await request.get('/manifest.webmanifest')).json() as { display: string; start_url: string; icons: Array<{ src: string; sizes: string; purpose: string }> };
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
    expect((await request.get('/sw.js')).status()).toBe(200);
    expect(await (await request.get('/offline.html')).text()).toContain('lang="kk"');
  });

  test('the observer is offered the install button, which is used once and then hidden', async ({ page }) => {
    await mockObserver(page);
    await page.addInitScript(() => {
      (window as unknown as { __prompted: number }).__prompted = 0;
      window.addEventListener('DOMContentLoaded', () => {
        const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
        event.prompt = async () => { (window as unknown as { __prompted: number }).__prompted += 1; };
        event.userChoice = Promise.resolve({ outcome: 'accepted' });
        setTimeout(() => window.dispatchEvent(event), 300);
      });
    });
    await page.goto('/mentor');
    await expect(page.getByRole('heading', { name: 'Install to your home screen' })).toBeVisible();
    await page.getByRole('button', { name: 'Install', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Install to your home screen' })).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1);
  });

  test.describe('on an iPhone', () => {
    test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });

    test('the observer reads the Share instruction, and declining hides it for good', async ({ page }) => {
      await mockObserver(page);
      await page.goto('/mentor');
      await expect(page.getByText('Add to Home Screen', { exact: false })).toBeVisible();
      await page.getByRole('button', { name: 'Not now' }).click();
      await expect(page.getByRole('heading', { name: 'Install to your home screen' })).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole('navigation', { name: 'Session sections' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Install to your home screen' })).toHaveCount(0);
    });
  });
});
