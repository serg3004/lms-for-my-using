import type { Page } from '@playwright/test';

/** PR 506: the badge sign-in API as a small fake: the scan, the PIN, the kiosk session and its end. */
export const badgeToken = 'B'.repeat(43);
export const badgePin = '4821';
export const kioskUser = { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', organizationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', email: 'learner@example.invalid', firstName: 'Айгуль', lastName: 'Каримова', middleName: null, status: 'active', roles: ['learner'], locale: 'ru', timezone: 'Asia/Almaty', mustChangePassword: false, kiosk: true };

export type BadgeState = { signedIn: boolean; sessionEnded: boolean; scans: Array<{ token: string; pin?: string }>; loggedOut: boolean };
export const newBadgeState = (): BadgeState => ({ signedIn: false, sessionEnded: false, scans: [], loggedOut: false });

const json = (status: number, body: unknown) => ({ status, json: body });
const error = (status: number, code: string) => json(status, { statusCode: status, error: { code, message: code }, message: code });

export async function installBadgeMocks(page: Page, state: BadgeState) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const body = () => JSON.parse(request.postData() ?? '{}') as { token?: string; pin?: string };
    if (path === '/auth/badge/login') {
      const { token = '', pin } = body();
      state.scans.push(pin === undefined ? { token } : { token, pin });
      if (pin === undefined) return route.fulfill(json(201, { status: 'pinRequired' }));
      if (token !== badgeToken || pin !== badgePin) return route.fulfill(error(401, 'UNAUTHORIZED'));
      state.signedIn = true;
      return route.fulfill(json(201, { status: 'ok', accessToken: 'token', tokenType: 'Bearer', user: kioskUser, csrfToken: 'csrf' }));
    }
    if (path === '/auth/me') return state.signedIn ? route.fulfill(json(200, kioskUser)) : route.fulfill(error(401, 'UNAUTHORIZED'));
    if (path === '/auth/refresh') return route.fulfill(error(401, 'UNAUTHORIZED'));
    if (path === '/auth/logout') { state.signedIn = false; state.loggedOut = true; return route.fulfill(json(201, { accepted: true })); }
    if (state.sessionEnded && !path.startsWith('/auth/')) return route.fulfill(error(401, 'UNAUTHORIZED'));
    if (path.endsWith('/theme')) return route.fulfill(json(200, { themeSettings: {} }));
    if (path === '/notifications/unread-count') return route.fulfill(json(200, { count: 0 }));
    return route.fulfill(error(404, 'NOT_FOUND'));
  });
}
