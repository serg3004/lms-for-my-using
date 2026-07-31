import {
  createInMemoryRateLimitStore,
  createRedisRateLimitStore,
  createSecurityHeadersMiddleware,
  createSensitiveRouteRateLimitMiddleware,
  type MinimalRedis,
} from './api-hardening';

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

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(nextTracker.calls).toBe(1);
  });

  it('limits sensitive POST routes after the configured threshold', async () => {
    let currentTime = 1_000;
    const store = createInMemoryRateLimitStore(() => currentTime);
    const middleware = createSensitiveRouteRateLimitMiddleware(store);
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

  it('keeps the request query in the normalized rate limit error path', async () => {
    const store = createInMemoryRateLimitStore(() => 1_000);
    const middleware = createSensitiveRouteRateLimitMiddleware(store);
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

  it('fails open when the store throws', async () => {
    const redis: MinimalRedis = {
      eval: async () => {
        throw new Error('Redis connection refused');
      },
    };
    const store = createRedisRateLimitStore(redis);
    const middleware = createSensitiveRouteRateLimitMiddleware(store);
    const request = createRequest();
    const nextTracker = createNextTracker();

    await middleware(request as never, createResponse() as never, nextTracker.next.bind(nextTracker));

    expect(nextTracker.calls).toBe(1);
  });
});
