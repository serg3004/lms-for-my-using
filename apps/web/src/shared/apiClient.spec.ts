import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiRequest, uploadChecklistItemPhotoWithProgress, uploadMaterialFileWithProgress } from './apiClient';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>(async () => response);
  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

function createStorageStub() {
  const storage = new Map<string, string>();

  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  };
}

describe('apiRequest', () => {
  it('forwards caller cancellation while keeping the request timeout signal active', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetchMock);

    const request = apiRequest('/slow', { signal: controller.signal });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock.mock.calls[0]?.[1]?.signal).not.toBe(controller.signal);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('still reports the internal request timeout as an API failure', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetchMock);

    const request = apiRequest('/slow');
    const rejection = expect(request).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 408,
      message: 'Request timed out',
    });
    await vi.advanceTimersByTimeAsync(30_000);

    await rejection;
    vi.useRealTimers();
  });

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
    mockFetch(new Response(null, {
      status: 503,
      headers: { 'x-request-id': 'a8098c1a-f86e-11da-bd1a-00112444be1e' },
    }));

    await expect(apiRequest('/empty')).rejects.toMatchObject({
      name: 'ApiClientError',
      message: 'Request failed',
      status: 503,
      code: 'HTTP_ERROR',
      response: null,
      requestId: 'a8098c1a-f86e-11da-bd1a-00112444be1e',
    });
  });

  it('does not attach legacy bearer tokens from browser storage', async () => {
    const localStorage = createStorageStub();
    const sessionStorage = createStorageStub();

    localStorage.setItem('authToken', 'legacy-auth-token');
    localStorage.setItem('token', 'legacy-token');
    sessionStorage.setItem('authToken', 'legacy-session-auth-token');
    sessionStorage.setItem('token', 'legacy-session-token');

    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('sessionStorage', sessionStorage);

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

  it('refreshes an expired access cookie and retries the original request once', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'renewed' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest<{ id: string }>('/auth/me')).resolves.toEqual({ id: 'user-1' });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/auth/me',
      '/api/v1/auth/refresh',
      '/api/v1/auth/me',
    ]);
  });

  it('shares one refresh request between concurrent authentication failures', async () => {
    let resolveRefresh!: (response: Response) => void;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const requestCounts = new Map<string, number>();
    const fetchMock = vi.fn<typeof fetch>(async (url): Promise<Response> => {
      if (url === '/api/v1/auth/refresh') return refreshResponse;
      const requestUrl = String(url);
      const callsForUrl = (requestCounts.get(requestUrl) ?? 0) + 1;
      requestCounts.set(requestUrl, callsForUrl);
      return callsForUrl === 1
        ? new Response(null, { status: 401 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const requests = [apiRequest('/one'), apiRequest('/two')];
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/v1/auth/refresh')).toHaveLength(1);
    });
    resolveRefresh(new Response(null, { status: 201 }));

    await expect(Promise.all(requests)).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/v1/auth/refresh')).toHaveLength(1);
  });

  it('retries a stale 401 without refreshing again after another request renewed the cookie', async () => {
    let resolveDelayedUnauthorized!: (response: Response) => void;
    const delayedUnauthorized = new Promise<Response>((resolve) => {
      resolveDelayedUnauthorized = resolve;
    });
    const requestCounts = new Map<string, number>();
    const fetchMock = vi.fn<typeof fetch>(async (url): Promise<Response> => {
      if (url === '/api/v1/auth/refresh') {
        return new Response(JSON.stringify({ accessToken: 'renewed' }), { status: 201 });
      }
      if (url === '/api/v1/auth/me' && !requestCounts.has(String(url))) {
        requestCounts.set(String(url), 1);
        return delayedUnauthorized;
      }
      const requestUrl = String(url);
      const callsForUrl = (requestCounts.get(requestUrl) ?? 0) + 1;
      requestCounts.set(requestUrl, callsForUrl);
      return callsForUrl === 1
        ? new Response(null, { status: 401 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const staleRequest = apiRequest('/auth/me');
    await expect(apiRequest('/courses')).resolves.toEqual({ ok: true });
    resolveDelayedUnauthorized(new Response(null, { status: 401 }));

    await expect(staleRequest).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/v1/auth/refresh')).toHaveLength(1);
  });
});

describe('uploadMaterialFileWithProgress', () => {
  it('uploads buffered files through the material-scoped endpoint', async () => {
    const opened: string[] = [];
    const progress = vi.fn();

    class XMLHttpRequestStub {
      status = 200;
      responseText = JSON.stringify({ id: 'material-1', scanStatus: 'pending' });
      withCredentials = false;
      readonly upload = {
        addEventListener: (_event: string, listener: (event: ProgressEvent) => void) => {
          listener({ lengthComputable: true, loaded: 4, total: 4 } as ProgressEvent);
        },
      };
      private readonly listeners = new Map<string, () => void>();

      addEventListener(event: string, listener: () => void) {
        this.listeners.set(event, listener);
      }

      open(_method: string, url: string) {
        opened.push(url);
      }

      setRequestHeader() {}

      send() {
        this.listeners.get('load')?.();
      }
    }

    vi.stubGlobal('XMLHttpRequest', XMLHttpRequestStub);

    await expect(
      uploadMaterialFileWithProgress('material/with spaces', new File(['test'], 'test.pdf', { type: 'application/pdf' }), progress),
    ).resolves.toMatchObject({ id: 'material-1' });
    expect(opened).toEqual(['/api/v1/materials/material%2Fwith%20spaces/file']);
    expect(progress).toHaveBeenCalledWith(100);
  });
});

describe('uploadChecklistItemPhotoWithProgress', () => {
  it('uploads the file to the checklist item photo endpoint', async () => {
    const opened: string[] = [];
    const progress = vi.fn();

    class XMLHttpRequestStub {
      status = 200;
      responseText = JSON.stringify({ id: 'instance-1' });
      withCredentials = false;
      readonly upload = {
        addEventListener: (_event: string, listener: (event: ProgressEvent) => void) => {
          listener({ lengthComputable: true, loaded: 4, total: 4 } as ProgressEvent);
        },
      };
      private readonly listeners = new Map<string, () => void>();

      addEventListener(event: string, listener: () => void) {
        this.listeners.set(event, listener);
      }

      open(_method: string, url: string) {
        opened.push(url);
      }

      setRequestHeader() {}

      send() {
        this.listeners.get('load')?.();
      }
    }

    vi.stubGlobal('XMLHttpRequest', XMLHttpRequestStub);

    await expect(
      uploadChecklistItemPhotoWithProgress('instance 1', 'item 1', new File(['test'], 'photo.jpg', { type: 'image/jpeg' }), progress),
    ).resolves.toMatchObject({ id: 'instance-1' });
    expect(opened).toEqual(['/api/v1/checklist-instances/instance%201/items/item%201/photo']);
    expect(progress).toHaveBeenCalledWith(100);
  });

  it('rejects when the server returns an error', async () => {
    class XMLHttpRequestStub {
      status = 400;
      responseText = JSON.stringify({ statusCode: 400, error: { code: 'BAD_REQUEST', message: 'Only images allowed' }, path: '/x', timestamp: 'now' });
      withCredentials = false;
      readonly upload = { addEventListener: () => undefined };
      private readonly listeners = new Map<string, () => void>();

      addEventListener(event: string, listener: () => void) {
        this.listeners.set(event, listener);
      }

      getResponseHeader() {
        return null;
      }

      open() {}

      setRequestHeader() {}

      send() {
        this.listeners.get('load')?.();
      }
    }

    vi.stubGlobal('XMLHttpRequest', XMLHttpRequestStub);

    await expect(
      uploadChecklistItemPhotoWithProgress('instance-1', 'item-1', new File(['test'], 'photo.jpg', { type: 'image/jpeg' }), vi.fn()),
    ).rejects.toMatchObject({ message: 'Only images allowed' });
  });
});
