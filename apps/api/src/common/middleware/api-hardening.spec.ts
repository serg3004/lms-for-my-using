import { createSecurityHeadersMiddleware, createSensitiveRouteRateLimitMiddleware } from './api-hardening';

type TestRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket: {
    remoteAddress?: string;
  };
};

function createRequest(overrides: Partial<TestRequest> = {}): TestRequest {
  return {
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: {},
    socket: {
      remoteAddress: '127.0.0.1',
    },
    ...overrides,
  };
}

function createResponse() {
  const headers = new Map<string, string | string[]>();

  return {
    statusCode: 200,
    body: '',
    headers,
    setHeader(name: string, value: string | string[]) {
      headers.set(name, value);
      return this;
    },
    end(body: string) {
      this.body = body;
    },
  };
}

describe('API hardening middleware', () => {
  it('sets security headers', () => {
    const middleware = createSecurityHeadersMiddleware();
    const request = createRequest();
    const response = createResponse();
    const next = jest.fn();

    middleware(request, response, next);

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('limits sensitive POST routes after the configured threshold', () => {
    let currentTime = 1_000;
    const middleware = createSensitiveRouteRateLimitMiddleware(() => currentTime);
    const request = createRequest();
    const response = createResponse();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      middleware(request, createResponse(), jest.fn());
    }

    const next = jest.fn();
    middleware(request, response, next);

    expect(response.statusCode).toBe(429);
    expect(response.body).toBe(JSON.stringify({ error: 'TOO_MANY_REQUESTS' }));
    expect(next).not.toHaveBeenCalled();

    currentTime += 60_001;
    const nextAfterReset = jest.fn();
    middleware(request, createResponse(), nextAfterReset);

    expect(nextAfterReset).toHaveBeenCalledTimes(1);
  });

  it('skips non-sensitive routes', () => {
    const middleware = createSensitiveRouteRateLimitMiddleware();
    const request = createRequest({ url: '/api/v1/courses' });
    const next = jest.fn();

    for (let attempt = 0; attempt < 25; attempt += 1) {
      middleware(request, createResponse(), next);
    }

    expect(next).toHaveBeenCalledTimes(25);
  });
});
