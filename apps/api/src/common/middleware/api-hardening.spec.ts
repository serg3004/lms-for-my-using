import { jest } from '@jest/globals';

import {
  createInMemoryRateLimitStore,
  createRedisRateLimitStore,
  createSecurityHeadersMiddleware,
  createSensitiveRouteRateLimitMiddleware,
  type MinimalRedis,
} from './api-hardening';

type TestRequest = {
  body?: unknown;
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
    body: {
      organizationId: 'example-org',
      email: 'learner@example.com',
      password: 'secret',
    },
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

function createNextTracker() {
  return {
    calls: 0,
    next() {
      this.calls += 1;
    },
  };
}

describe('API hardening middleware', () => {
  it('sets security headers', () => {
    const middleware = createSecurityHeadersMiddleware();
    const request = createRequest();
    const response = createResponse();
    const nextTracker = createNextTracker();

    middleware(request as never, response as never, nextTracker.next.bind(nextTracker));

    expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
    expect(response.headers.get('Content-Security-Policy')).toBe(
      "default-src 'none'; script-src 'none'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    expect(response.headers.get('Content-Security-Policy')).not.toContain("'unsafe-eval'");
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(nextTracker.calls).toBe(1);
  });

  it('limits sensitive POST routes after the configured threshold', async () => {
    let currentTime = 1_000;
    const store = createInMemoryRateLimitStore(() => currentTime);
    const middleware = createSensitiveRouteRateLimitMiddleware(store, {
      ip: { maxRequests: 20, windowMs: 60_000 },
      account: [{ maxRequests: 20, windowMs: 60_000 }],
      global: { maxRequests: 100, windowMs: 60_000 },
    });
    const request = createRequest();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const nextTracker = createNextTracker();

      await middleware(request as never, createResponse() as never, nextTracker.next.bind(nextTracker));
    }

    const response = createResponse();
    const nextTracker = createNextTracker();

    await middleware(request as never, response as never, nextTracker.next.bind(nextTracker));

    const body = JSON.parse(response.body) as {
      statusCode: number;
      error: {
        code: string;
        message: string;
      };
      path: string;
      timestamp: string;
    };

    expect(response.statusCode).toBe(429);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(body).toMatchObject({
      statusCode: 429,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests',
      },
      path: '/api/v1/auth/login',
    });
    expect(body.timestamp).toEqual(expect.any(String));
    expect(nextTracker.calls).toBe(0);

    currentTime += 60_001;
    const nextAfterReset = createNextTracker();

    await middleware(request as never, createResponse() as never, nextAfterReset.next.bind(nextAfterReset));

    expect(nextAfterReset.calls).toBe(1);
  });

  it('sweeps expired in-memory entries so a sustained attack cannot grow the store forever', async () => {
    let currentTime = 1_000;
    const store = createInMemoryRateLimitStore(() => currentTime);
    const windowMs = 60_000;

    // Every key here expires immediately after being written (advance time past the window
    // before the next distinct key), simulating an attacker rotating IPs/accounts.
    for (let i = 0; i < 5_000; i += 1) {
      await store.increment(`key-${i}`, windowMs);
    }
    expect(store.size()).toBe(5_000);

    currentTime += windowMs + 1;

    // Without sweeping, writing 5,000 more distinct keys would leave 10,000 entries held
    // forever. The sweep triggered partway through this batch should reclaim the first
    // 5,000, which are now expired — so the store should end up well under 10,000.
    for (let i = 5_000; i < 10_000; i += 1) {
      await store.increment(`key-${i}`, windowMs);
    }
    expect(store.size()).toBeLessThan(10_000);
  });

  it('keeps the request query in the normalized rate limit error path', async () => {
    const store = createInMemoryRateLimitStore(() => 1_000);
    const middleware = createSensitiveRouteRateLimitMiddleware(store, {
      ip: { maxRequests: 100, windowMs: 60_000 },
      account: [{ maxRequests: 20, windowMs: 60_000 }],
      global: { maxRequests: 100, windowMs: 60_000 },
    });
    const request = createRequest({ url: '/api/v1/auth/login?next=%2Flearn' });

    for (let attempt = 0; attempt < 21; attempt += 1) {
      const nextTracker = createNextTracker();

      await middleware(request as never, createResponse() as never, nextTracker.next.bind(nextTracker));
    }

    const response = createResponse();
    const blockedNextTracker = createNextTracker();

    await middleware(request as never, response as never, blockedNextTracker.next.bind(blockedNextTracker));

    expect(JSON.parse(response.body)).toMatchObject({
      statusCode: 429,
      path: '/api/v1/auth/login?next=%2Flearn',
    });
  });

  it('skips non-sensitive routes', async () => {
    const middleware = createSensitiveRouteRateLimitMiddleware();
    const request = createRequest({ url: '/api/v1/courses' });
    const nextTracker = createNextTracker();

    for (let attempt = 0; attempt < 25; attempt += 1) {
      await middleware(request as never, createResponse() as never, nextTracker.next.bind(nextTracker));
    }

    expect(nextTracker.calls).toBe(25);
  });

  it('keeps the progressive account limit when an attacker changes IP', async () => {
    const middleware = createSensitiveRouteRateLimitMiddleware(createInMemoryRateLimitStore(), {
      ip: { maxRequests: 100, windowMs: 60_000 },
      account: [
        { maxRequests: 2, windowMs: 60_000 },
        { maxRequests: 3, windowMs: 15 * 60_000 },
      ],
      global: { maxRequests: 100, windowMs: 60_000 },
    });

    for (const ip of ['192.0.2.1', '192.0.2.2', '192.0.2.3']) {
      const nextTracker = createNextTracker();
      await middleware(createRequest({ ip }) as never, createResponse() as never, nextTracker.next.bind(nextTracker));
    }

    const response = createResponse();
    const nextTracker = createNextTracker();
    await middleware(
      createRequest({ ip: '192.0.2.4' }) as never,
      response as never,
      nextTracker.next.bind(nextTracker),
    );

    expect(response.statusCode).toBe(429);
    expect(nextTracker.calls).toBe(0);
  });

  it('normalizes organization and email before applying the account limit', async () => {
    const middleware = createSensitiveRouteRateLimitMiddleware(createInMemoryRateLimitStore(), {
      ip: { maxRequests: 100, windowMs: 60_000 },
      account: [{ maxRequests: 1, windowMs: 60_000 }],
      global: { maxRequests: 100, windowMs: 60_000 },
    });
    await middleware(createRequest() as never, createResponse() as never, () => undefined);
    const response = createResponse();

    await middleware(
      createRequest({
        ip: '192.0.2.2',
        body: { organizationId: ' EXAMPLE-ORG ', email: ' Learner@Example.COM ', password: 'secret' },
      }) as never,
      response as never,
      () => undefined,
    );

    expect(response.statusCode).toBe(429);
  });

  it('does not block different accounts behind one NAT at the low account threshold', async () => {
    const middleware = createSensitiveRouteRateLimitMiddleware(createInMemoryRateLimitStore(), {
      ip: { maxRequests: 10, windowMs: 60_000 },
      account: [{ maxRequests: 1, windowMs: 60_000 }],
      global: { maxRequests: 100, windowMs: 60_000 },
    });

    for (const email of ['one@example.com', 'two@example.com', 'three@example.com']) {
      const nextTracker = createNextTracker();
      await middleware(
        createRequest({ body: { organizationId: 'example-org', email, password: 'secret' } }) as never,
        createResponse() as never,
        nextTracker.next.bind(nextTracker),
      );
      expect(nextTracker.calls).toBe(1);
    }
  });

  it.each(['/api/v1/auth/login', '/api/v1/auth/password-reset/request'])(
    'uses the same public response for every limiting level on %s',
    async (url) => {
      const responses: string[] = [];
      for (const limitingPolicy of [
        { ip: 0, account: 100, global: 100 },
        { ip: 100, account: 0, global: 100 },
        { ip: 100, account: 100, global: 0 },
      ]) {
        const middleware = createSensitiveRouteRateLimitMiddleware(createInMemoryRateLimitStore(), {
          ip: { maxRequests: limitingPolicy.ip, windowMs: 60_000 },
          account: [{ maxRequests: limitingPolicy.account, windowMs: 60_000 }],
          global: { maxRequests: limitingPolicy.global, windowMs: 60_000 },
        });
        const response = createResponse();
        await middleware(createRequest({ url }) as never, response as never, () => undefined);
        const body = JSON.parse(response.body) as { timestamp?: string };
        delete body.timestamp;
        responses.push(JSON.stringify(body));
      }

      expect(new Set(responses).size).toBe(1);
    },
  );
});

describe('Redis rate limit store', () => {
  it('atomically increments a namespaced counter and assigns its TTL', async () => {
    const calls: unknown[][] = [];
    const redis: MinimalRedis = {
      eval: async (...args) => {
        calls.push(args);
        return 1;
      },
    };
    const store = createRedisRateLimitStore(redis, 'production');

    const count = await store.increment('test-key', 60_000);

    expect(count).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.slice(1)).toEqual([1, 'production:rate-limit:test-key', '60000']);
    expect(String(calls[0]?.[0])).toContain("redis.call('PEXPIRE', KEYS[1], ARGV[1])");
  });

  it('shares counters between store instances and preserves them across store recreation', async () => {
    const counters = new Map<string, number>();
    const redis: MinimalRedis = {
      eval: async (_script, _keys, key) => {
        const count = (counters.get(key) ?? 0) + 1;
        counters.set(key, count);
        return count;
      },
    };
    const firstInstance = createRedisRateLimitStore(redis, 'shared');
    const secondInstance = createRedisRateLimitStore(redis, 'shared');

    expect(await firstInstance.increment('key', 60_000)).toBe(1);
    expect(await secondInstance.increment('key', 60_000)).toBe(2);

    const restartedInstance = createRedisRateLimitStore(redis, 'shared');
    expect(await restartedInstance.increment('key', 60_000)).toBe(3);
  });

  it.each([
    '/api/v1/auth/login',
    '/api/v1/auth/password-reset/request',
    '/api/v1/auth/password-reset/confirm',
    '/api/v1/organizations/register',
  ])('enforces the local emergency limit when Redis fails on %s', async (url) => {
    const store = {
      increment: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
    };
    const modeChanged = jest.fn();
    const recordRequest = jest.fn();
    const middleware = createSensitiveRouteRateLimitMiddleware(
      store,
      {
        ip: { maxRequests: 1, windowMs: 60_000 },
        account: [{ maxRequests: 1, windowMs: 60_000 }],
        global: { maxRequests: 100, windowMs: 60_000 },
      },
      { observability: { modeChanged, recordRequest } },
    );

    await middleware(createRequest({ url }) as never, createResponse() as never, () => undefined);
    const response = createResponse();
    const nextTracker = createNextTracker();
    await middleware(createRequest({ url }) as never, response as never, nextTracker.next.bind(nextTracker));

    expect(response.statusCode).toBe(429);
    expect(nextTracker.calls).toBe(0);
    expect(modeChanged).toHaveBeenCalledTimes(1);
    expect(modeChanged).toHaveBeenCalledWith('local-degraded', expect.any(Error));
    expect(recordRequest).toHaveBeenCalledWith('local-degraded', url);
  });

  it('returns to Redis mode automatically after the store recovers', async () => {
    const store = {
      increment: jest
        .fn<Promise<number>, [string, number]>()
        .mockRejectedValueOnce(new Error('Redis connection refused'))
        .mockResolvedValue(1),
    };
    const modeChanged = jest.fn();
    const recordRequest = jest.fn();
    const middleware = createSensitiveRouteRateLimitMiddleware(store, undefined, {
      observability: { modeChanged, recordRequest },
    });

    await middleware(createRequest() as never, createResponse() as never, () => undefined);
    await middleware(createRequest() as never, createResponse() as never, () => undefined);

    expect(modeChanged.mock.calls).toEqual([
      ['local-degraded', expect.any(Error)],
      ['redis'],
    ]);
    expect(recordRequest).toHaveBeenLastCalledWith('redis', '/api/v1/auth/login');
  });
});
