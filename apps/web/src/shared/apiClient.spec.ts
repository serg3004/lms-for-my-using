import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from './apiClient';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

function mockFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>(async () => response);
  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

describe('apiRequest', () => {
  it('throws ApiClientError with normalized 429 ApiErrorResponse details', async () => {
    const errorResponse = {
      statusCode: 429,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests',
      },
      path: '/api/v1/auth/login',
      timestamp: '2026-01-01T00:00:00.000Z',
    };

    mockFetch(
      new Response(JSON.stringify(errorResponse), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(apiRequest('/auth/login')).rejects.toMatchObject({
      name: 'ApiClientError',
      message: 'Too many requests',
      status: 429,
      code: 'TOO_MANY_REQUESTS',
      response: errorResponse,
    });
  });

  it('keeps 401 authentication failures available for route guards', async () => {
    const errorResponse = {
      statusCode: 401,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
      path: '/api/v1/auth/me',
      timestamp: '2026-01-01T00:00:00.000Z',
    };

    mockFetch(
      new Response(JSON.stringify(errorResponse), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(apiRequest('/auth/me')).rejects.toMatchObject({
      name: 'ApiClientError',
      message: 'Authentication required',
      status: 401,
      code: 'UNAUTHORIZED',
      response: errorResponse,
    });
  });

  it('keeps 403 authorization failures available for access feedback', async () => {
    const errorResponse = {
      statusCode: 403,
      error: {
        code: 'FORBIDDEN',
        message: 'Access denied',
      },
      path: '/api/v1/admin/users',
      timestamp: '2026-01-01T00:00:00.000Z',
    };

    mockFetch(
      new Response(JSON.stringify(errorResponse), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(apiRequest('/admin/users')).rejects.toMatchObject({
      name: 'ApiClientError',
      message: 'Access denied',
      status: 403,
      code: 'FORBIDDEN',
      response: errorResponse,
    });
  });

  it('falls back to legacy error messages when response does not match ApiErrorResponse', async () => {
    mockFetch(
      new Response(JSON.stringify({ message: 'Legacy failure' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(apiRequest('/legacy')).rejects.toMatchObject({
      name: 'ApiClientError',
      message: 'Legacy failure',
      status: 400,
      code: 'HTTP_ERROR',
      response: null,
    });
  });

  it('keeps status when response body is empty', async () => {
    mockFetch(new Response(null, { status: 503 }));

    await expect(apiRequest('/empty')).rejects.toMatchObject({
      name: 'ApiClientError',
      message: 'Request failed',
      status: 503,
      code: 'HTTP_ERROR',
      response: null,
    });
  });

  it('does not attach legacy bearer tokens from browser storage', async () => {
    window.localStorage.setItem('authToken', 'legacy-auth-token');
    window.localStorage.setItem('token', 'legacy-token');
    window.sessionStorage.setItem('authToken', 'legacy-session-auth-token');
    window.sessionStorage.setItem('token', 'legacy-session-token');

    const fetchMock = mockFetch(
      new Response(JSON.stringify({ id: 'user-1', roles: ['learner'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await apiRequest('/auth/me');

    const requestInit = fetchMock.mock.calls[0]?.[1];

    expect(requestInit).toBeDefined();

    const headers = requestInit?.headers as Headers;

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/me',
      expect.objectContaining({
        credentials: 'same-origin',
      }),
    );
    expect(headers.has('Authorization')).toBe(false);
  });

  it('returns successful JSON responses', async () => {
    mockFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(apiRequest<{ ok: boolean }>('/health')).resolves.toEqual({ ok: true });
  });
});
