import type { Page } from '@playwright/test';

/** PR 496: the person's own profile as a small in-memory fake (profile, photo upload and removal, version conflicts). */
export const profileOrgId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const profileUserId = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';

export type ProfileCalls = { patches: Array<Record<string, unknown>>; uploads: number; removals: number };

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

export async function installUserProfileMocks(page: Page, options: { conflictOnce?: boolean } = {}): Promise<ProfileCalls> {
  const calls: ProfileCalls = { patches: [], uploads: 0, removals: 0 };
  let conflict = options.conflictOnce === true;
  const profile = { phone: null as string | null, locale: 'ru', timezone: 'Asia/Almaty', aboutMe: null as string | null, hasPhoto: false, version: 0 };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const method = request.method();
    if (path === '/auth/me') return route.fulfill({ json: { id: profileUserId, organizationId: profileOrgId, firstName: 'Айгуль', lastName: 'Сергеева', middleName: null, email: 'aigul@example.invalid', roles: ['learner'], locale: 'ru', timezone: profile.timezone, phone: profile.phone, status: 'active', position: 'Кладовщик', shift: null } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path.endsWith('/password-policy')) return route.fulfill({ json: { minLength: 10, historyCount: 3 } });
    if (path === '/auth/me/sessions') return route.fulfill({ json: [] });
    if (path === '/auth/me/profile' && method === 'GET') return route.fulfill({ json: { ...profile } });
    if (path === '/auth/me/profile' && method === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      calls.patches.push(body);
      if (conflict) {
        conflict = false;
        profile.version += 1;
        profile.aboutMe = 'Изменено в другой вкладке';
        return route.fulfill({ status: 409, json: { statusCode: 409, error: { code: 'CONFLICT', message: 'The profile was changed elsewhere' }, message: 'The profile was changed elsewhere' } });
      }
      Object.assign(profile, { phone: body.phone ?? null, timezone: body.timezone ?? profile.timezone, aboutMe: body.aboutMe ?? null, version: profile.version + 1 });
      return route.fulfill({ json: { ...profile } });
    }
    if (path === '/auth/me/photo' && method === 'POST') { calls.uploads += 1; profile.hasPhoto = true; profile.version += 1; return route.fulfill({ status: 201, json: { ...profile } }); }
    if (path === '/auth/me/photo' && method === 'DELETE') { calls.removals += 1; profile.hasPhoto = false; profile.version += 1; return route.fulfill({ json: { ...profile } }); }
    if (path === '/users/me/photo') return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    return route.fulfill({ status: 404, json: { statusCode: 404, error: { code: 'NOT_FOUND', message: 'Not mocked' }, message: 'Not mocked' } });
  });
  return calls;
}
