import type { Page } from '@playwright/test';

/** PR 501: the public activation and sign-in-by-number API as a small fake. */
export type IdentityCalls = { activations: Array<Record<string, unknown>>; logins: Array<Record<string, unknown>> };

export const knownNumber = '10245';

export async function installIdentityMocks(page: Page): Promise<IdentityCalls> {
  const calls: IdentityCalls = { activations: [], logins: [] };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/activate' && request.method() === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      calls.activations.push(body);
      if (body['employeeNumber'] !== knownNumber) return route.fulfill({ status: 400, json: { statusCode: 400, error: { code: 'BAD_REQUEST', message: 'Data not found' }, path, timestamp: '2026-11-22T10:00:00.000Z', message: 'Data not found' } });
      return route.fulfill({ status: 201, json: { accepted: true } });
    }
    if (path === '/auth/login' && request.method() === 'POST') {
      calls.logins.push(JSON.parse(request.postData() ?? '{}') as Record<string, unknown>);
      return route.fulfill({ status: 401, json: { statusCode: 401, error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid credentials' }, path, timestamp: '2026-11-22T10:00:00.000Z', message: 'Invalid credentials' } });
    }
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    return route.fulfill({ status: 404, json: { statusCode: 404, error: { code: 'NOT_FOUND', message: 'Not mocked' }, message: 'Not mocked' } });
  });
  return calls;
}
