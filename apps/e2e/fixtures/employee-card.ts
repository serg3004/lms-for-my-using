import type { Page } from '@playwright/test';

import { badgeToken } from './badge.js';

/** PR 507: the employee card opened by a badge scan, as a small fake: anonymous scan, signed-in viewer, outside inspector. */
export { badgeToken };
export type CardMode = 'anonymous' | 'peer' | 'inspector';
export type CardCalls = { opened: string[]; anonymous: string[]; checked: string[] };

const viewer = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', organizationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', email: 'viewer@example.invalid', firstName: 'Марат', lastName: 'Оспанов', middleName: null, status: 'active', roles: ['learner'], locale: 'ru', timezone: 'Asia/Almaty', mustChangePassword: false };
const peerCard = {
  level: 'peer', detail: false, blocks: ['courses', 'certificates', 'checklists', 'clearance'],
  subject: { name: 'Айгуль Каримова', hasPhoto: false, position: 'Повар', department: 'Кухня' },
  clearance: { ok: false, overdueCourses: 1, overdueChecklists: 0, revokedCertificates: 0 },
  courses: [{ title: 'Охрана труда', status: 'overdue', dueAt: '2026-01-10T00:00:00.000Z' }, { title: 'Пожарная безопасность', status: 'done' }],
  certificates: [{ title: 'Санитарная книжка', status: 'valid', issuedAt: '2026-01-05T00:00:00.000Z' }],
  checklists: [{ title: 'Открытие смены', status: 'done' }],
};
const inspectorCard = { level: 'inspector', detail: false, blocks: ['clearance'], subject: { name: 'Айгуль Каримова', hasPhoto: false, position: 'Повар' }, clearance: { ok: true } };

export async function installEmployeeCardMocks(page: Page, mode: CardMode): Promise<CardCalls> {
  const calls: CardCalls = { opened: [], anonymous: [], checked: [] };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const body = () => (request.postDataJSON() ?? {}) as { token?: string };
    const err = (status: number, code: string) => route.fulfill({ status, json: { statusCode: status, error: { code, message: code }, message: code } });
    if (path === '/auth/me') {
      if (mode === 'anonymous') return err(401, 'UNAUTHORIZED');
      return route.fulfill({ json: mode === 'inspector' ? { ...viewer, inspector: { visible: ['clearance'], accessUntil: '2026-12-31T00:00:00.000Z' } } : viewer });
    }
    if (path === '/auth/refresh') return err(401, 'UNAUTHORIZED');
    if (path === '/employee-card/open') {
      calls.opened.push(body().token ?? '');
      return mode === 'anonymous' ? err(401, 'UNAUTHORIZED') : route.fulfill({ status: 201, json: mode === 'inspector' ? inspectorCard : peerCard });
    }
    if (path === '/employee-card/anonymous-scan') { calls.anonymous.push(body().token ?? ''); return route.fulfill({ status: 201, json: { recorded: true } }); }
    if (path === '/employee-card/checked') { calls.checked.push(body().token ?? ''); return route.fulfill({ status: 201, json: { checked: true, at: '2026-11-22T10:00:00.000Z' } }); }
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    return err(404, 'NOT_FOUND');
  });
  return calls;
}
