import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from './apiClient';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(response: Response) {
  vi.stubGlobal('fetch', vi.fn(async () => response));
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
