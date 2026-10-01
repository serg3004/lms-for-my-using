import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearAuthAccessToken,
  createAuthenticatedFetch,
  installAuthenticatedFetch,
  setAuthAccessToken,
} from './authTransport';

afterEach(() => {
  clearAuthAccessToken();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('authenticated fetch transport', () => {
  it('uses the in-memory access token for following API requests', async () => {
    setAuthAccessToken('login-access-token');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const authenticatedFetch = createAuthenticatedFetch(fetchImpl);

    await authenticatedFetch('/api/v1/auth/me');

    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer login-access-token');
  });

  it('preserves an explicit authorization header', async () => {
    setAuthAccessToken('in-memory-token');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const authenticatedFetch = createAuthenticatedFetch(fetchImpl);

    await authenticatedFetch('/api/v1/auth/me', {
      headers: { Authorization: 'Bearer explicit-token' },
    });

    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer explicit-token');
  });

  it('preserves headers from a Request input', async () => {
    setAuthAccessToken('access-token');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const authenticatedFetch = createAuthenticatedFetch(fetchImpl);
    const request = new Request('http://localhost/api/v1/auth/me', {
      headers: { 'X-Request-Marker': 'request-header' },
    });

    await authenticatedFetch(request, { headers: { 'X-Init-Marker': 'init-header' } });

    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('X-Request-Marker')).toBe('request-header');
    expect(headers.get('X-Init-Marker')).toBe('init-header');
    expect(headers.get('Authorization')).toBe('Bearer access-token');
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

  it('clears the in-memory token when refresh is rejected by the API', async () => {
    setAuthAccessToken('expired-access-token');
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const authenticatedFetch = createAuthenticatedFetch(fetchImpl);

    await authenticatedFetch('/api/v1/auth/refresh', { method: 'POST' });
    await authenticatedFetch('/api/v1/auth/me');

    const headers = fetchImpl.mock.calls[1]?.[1]?.headers as Headers;
    expect(headers.has('Authorization')).toBe(false);
  });

  it('clears the in-memory token when refresh fails on the network', async () => {
    setAuthAccessToken('expired-access-token');
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const authenticatedFetch = createAuthenticatedFetch(fetchImpl);

    await expect(authenticatedFetch('/api/v1/auth/refresh', { method: 'POST' })).rejects.toThrow('offline');
    await authenticatedFetch('/api/v1/auth/me');

    const headers = fetchImpl.mock.calls[1]?.[1]?.headers as Headers;
    expect(headers.has('Authorization')).toBe(false);
  });

  it('keeps the previous token when a successful refresh body is not valid JSON', async () => {
    setAuthAccessToken('existing-access-token');
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('not-json', { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const authenticatedFetch = createAuthenticatedFetch(fetchImpl);

    await authenticatedFetch('/api/v1/auth/refresh', { method: 'POST' });
    await authenticatedFetch('/api/v1/auth/me');

    const headers = fetchImpl.mock.calls[1]?.[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer existing-access-token');
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

  it('leaves non-API same-origin requests untouched', async () => {
    setAuthAccessToken('access-token');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const authenticatedFetch = createAuthenticatedFetch(fetchImpl);

    await authenticatedFetch('/assets/app.js');

    expect(fetchImpl).toHaveBeenCalledWith('/assets/app.js', {});
  });

  it('installs the authenticated wrapper around global fetch once', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    setAuthAccessToken('installed-token');

    installAuthenticatedFetch();
    const installedFetch = globalThis.fetch;
    installAuthenticatedFetch();
    await globalThis.fetch('/api/v1/auth/me');

    expect(globalThis.fetch).toBe(installedFetch);
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer installed-token');
  });
});
