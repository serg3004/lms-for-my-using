import { getAuthToken, setAuthToken } from './authToken.js';

const apiBasePath = '/api/v1';

type LoginInput = {
  organizationId: string;
  email: string;
  password: string;
};

type LoginResponse = {
  accessToken: string;
  tokenType: 'Bearer';
};

type ApiErrorResponse = {
  error?: {
    message?: string;
  };
  message?: string;
};

export class ApiClientError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiClientError';
  }
}

function getErrorMessage(body: unknown) {
  if (!body || typeof body !== 'object') {
    return 'Request failed';
  }

  const errorBody = body as ApiErrorResponse;

  return errorBody.error?.message ?? errorBody.message ?? 'Request failed';
}

function buildHeaders(hasBody: boolean) {
  const headers = new Headers();

  if (hasBody) {
    headers.set('Content-Type', 'application/json');
  }

  const accessToken = getAuthToken();

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  return headers;
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text) as unknown;
}

export async function apiRequest<TResponse>(path: string, init: RequestInit = {}) {
  const hasBody = Boolean(init.body);
  const response = await fetch(`${apiBasePath}${path}`, {
    ...init,
    headers: buildHeaders(hasBody),
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new ApiClientError(getErrorMessage(body), response.status);
  }

  return body as TResponse;
}

export async function login(input: LoginInput) {
  const response = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  setAuthToken(response.accessToken);

  return response;
}
