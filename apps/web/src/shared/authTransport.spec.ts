import { afterEach, describe, expect, it, vi } from 'vitest';

import { login } from './api/auth';
import {
  clearAuthAccessToken,
  createAuthenticatedFetch,
  setAuthAccessToken,
} from './authTransport';

afterEach(() => {
  clearAuthAccessToken();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('authenticated fetch transport', () => {
  it('uses the access token returned by login for following API requests', async () => {
    const loginFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        accessToken: 'login-access-token',
        tokenType: 'Bearer',
        user: { id: 'user-1', roles: ['admin'] },
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', loginFetch);

    await login({ organizationId: 'demo-company', email: 'admin@demo.com', password: 'Demo1234!' });

    const downstreamFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const authenticatedFetch = createAuthenticatedFetch(downstreamFetch);
    await authenticatedFetch('/api/v1/auth/me');

    const headers = downstreamFetch.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer login-access-token');
  });

  it('rotates the in-memory bearer token from a successful refresh response', async () => {
    setAuthAccessToken('expired-access-token');
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'renewed-access-token' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const authenticatedFetch = createAuthenticatedFetch(fetchImpl);

    await authenticatedFetch('/api/v1/auth/refresh', { method: 'POST' });
    await authenticatedFetch('/api/v1/auth/me');

    const refreshHeaders = fetchImpl.mock.calls[0]?.[1]?.headers as Headers;
    const retryHeaders = fetchImpl.mock.calls[1]?.[1]?.headers as Headers;
    expect(refreshHeaders.has('Authorization')).toBe(false);
    expect(retryHeaders.get('Authorization')).toBe('Bearer renewed-access-token');
  });

  it('does not send the in-memory token to login or cross-origin requests', async () => {
    setAuthAccessToken('access-token');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const authenticatedFetch = createAuthenticatedFetch(fetchImpl);

    await authenticatedFetch('/api/v1/auth/login', { method: 'POST' });
    await authenticatedFetch('https://example.com/resource');

    const loginHeaders = fetchImpl.mock.calls[0]?.[1]?.headers as Headers;
    expect(loginHeaders.has('Authorization')).toBe(false);
    expect(fetchImpl.mock.calls[1]?.[1]?.headers).toBeUndefined();
  });
});
