import type { BrowserContext, Page } from '@playwright/test';

/** PR 505: the QR sign-in API as one small fake shared by two browser contexts: the device and the phone. */
export const qrCode = 'Q'.repeat(43);
export const qrPollToken = 'S'.repeat(43);
export const qrUser = { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', organizationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', email: 'learner@example.invalid', firstName: 'Айгуль', lastName: 'Каримова', middleName: null, status: 'active', roles: ['learner'], locale: 'ru', timezone: 'Asia/Almaty', mustChangePassword: false };

export type QrState = { decision: 'pending' | 'approved' | 'denied'; starts: number; delivered: boolean; inspected: string[]; approved: string[]; denied: string[]; phoneSignedIn: boolean; phoneAllowed: boolean };

export function newQrState(): QrState {
  return { decision: 'pending', starts: 0, delivered: false, inspected: [], approved: [], denied: [], phoneSignedIn: true, phoneAllowed: true };
}

const json = (status: number, body: unknown) => ({ status, json: body });
const error = (status: number, code: string) => json(status, { statusCode: status, error: { code, message: code }, message: code });

export async function installQrMocks(target: Page | BrowserContext, state: QrState) {
  await target.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const body = () => JSON.parse(request.postData() ?? '{}') as Record<string, string>;
    if (path === '/auth/qr/start') {
      state.starts += 1;
      return route.fulfill(json(201, { code: qrCode, pollToken: qrPollToken, expiresAt: new Date(Date.now() + 120_000).toISOString() }));
    }
    if (path === '/auth/qr/status') {
      if (body()['pollToken'] !== qrPollToken || state.delivered) return route.fulfill(json(201, { status: 'expired' }));
      if (state.decision === 'approved') { state.delivered = true; return route.fulfill(json(201, { status: 'approved', accessToken: 'token', tokenType: 'Bearer', user: qrUser, csrfToken: 'csrf' })); }
      return route.fulfill(json(201, { status: state.decision }));
    }
    if (path === '/auth/qr/inspect' || path === '/auth/qr/approve' || path === '/auth/qr/deny') {
      if (!state.phoneSignedIn) return route.fulfill(error(401, 'UNAUTHORIZED'));
      if (body()['code'] !== qrCode) return route.fulfill(error(404, 'NOT_FOUND'));
      if (path === '/auth/qr/inspect') { state.inspected.push(qrCode); return route.fulfill(json(201, { deviceLabel: 'Chrome · Windows', ipMasked: '203.0.x.x', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 120_000).toISOString() })); }
      if (path === '/auth/qr/approve') {
        if (!state.phoneAllowed) return route.fulfill(error(403, 'FORBIDDEN'));
        state.approved.push(qrCode); state.decision = 'approved';
        return route.fulfill(json(201, { approved: true }));
      }
      state.denied.push(qrCode); state.decision = 'denied';
      return route.fulfill(json(201, { denied: true }));
    }
    if (path === '/auth/me') return route.fulfill(json(200, qrUser));
    if (path.endsWith('/theme')) return route.fulfill(json(200, { themeSettings: {} }));
    if (path === '/notifications/unread-count') return route.fulfill(json(200, { count: 0 }));
    return route.fulfill(error(404, 'NOT_FOUND'));
  });
}
