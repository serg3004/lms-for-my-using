const apiBasePath = '/api/v1';
const loginPath = `${apiBasePath}/auth/login`;
const refreshPath = `${apiBasePath}/auth/refresh`;

let accessToken: string | null = null;
let authenticatedFetchInstalled = false;

function getBaseOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return 'http://localhost';
}

function getRequestUrl(input: RequestInfo | URL) {
  const rawUrl = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;

  try {
    return new URL(rawUrl, getBaseOrigin());
  } catch {
    return null;
  }
}

function isSameOriginApiRequest(url: URL | null) {
  return Boolean(
    url
      && url.origin === getBaseOrigin()
      && (url.pathname === apiBasePath || url.pathname.startsWith(`${apiBasePath}/`)),
  );
}

function getRequestHeaders(input: RequestInfo | URL, init: RequestInit) {
  const headers = new Headers(
    typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
  );

  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  return headers;
}

function readAccessToken(body: unknown) {
  if (typeof body !== 'object' || body === null || !('accessToken' in body)) {
    return null;
  }

  const token = (body as { accessToken?: unknown }).accessToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

async function updateTokenFromRefreshResponse(response: Response) {
  if (!response.ok) {
    accessToken = null;
    return;
  }

  try {
    const token = readAccessToken(await response.clone().json());
    if (token) accessToken = token;
  } catch {
    // The API client will handle an invalid response body. Keep transport transparent here.
  }
}

export function setAuthAccessToken(token: string | null) {
  accessToken = token;
}

export function clearAuthAccessToken() {
  accessToken = null;
}

export function createAuthenticatedFetch(fetchImpl: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = getRequestUrl(input);

    if (!isSameOriginApiRequest(url)) {
      return fetchImpl(input, init);
    }

    const headers = getRequestHeaders(input, init);
    const isLoginRequest = url?.pathname === loginPath;
    const isRefreshRequest = url?.pathname === refreshPath;

    if (accessToken && !isLoginRequest && !isRefreshRequest && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    try {
      const response = await fetchImpl(input, { ...init, headers });
      if (isRefreshRequest) await updateTokenFromRefreshResponse(response);
      return response;
    } catch (error) {
      if (isRefreshRequest) accessToken = null;
      throw error;
    }
  };
}

export function installAuthenticatedFetch() {
  if (authenticatedFetchInstalled || typeof globalThis.fetch !== 'function') {
    return;
  }

  globalThis.fetch = createAuthenticatedFetch(globalThis.fetch.bind(globalThis));
  authenticatedFetchInstalled = true;
}
