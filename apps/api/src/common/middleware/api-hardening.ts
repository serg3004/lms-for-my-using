import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { createApiErrorResponse } from '../api-response.js';

type NextFunction = () => void;

type ApiRequest = IncomingMessage & {
  body?: unknown;
  ip?: string;
  socket: IncomingMessage['socket'] & {
    remoteAddress?: string;
  };
};

type ApiResponse = ServerResponse & {
  setHeader(name: string, value: string | string[]): ApiResponse;
};

type Middleware = (request: ApiRequest, response: ApiResponse, next: NextFunction) => void;

const TOO_MANY_REQUESTS_STATUS = 429;
const TOO_MANY_REQUESTS_CODE = 'TOO_MANY_REQUESTS';
const TOO_MANY_REQUESTS_MESSAGE = 'Too many requests';

const sensitiveRateLimitedRoutes = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/password-reset/request',
  '/api/v1/auth/password-reset/confirm',
  '/api/v1/organizations/register',
]);

const accountRateLimitedRoutes = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/password-reset/request',
]);

type RateLimitRule = {
  maxRequests: number;
  windowMs: number;
};

export type SensitiveRateLimitPolicy = {
  ip: RateLimitRule;
  account: RateLimitRule[];
  global: RateLimitRule;
};

export const DEFAULT_SENSITIVE_RATE_LIMIT_POLICY: SensitiveRateLimitPolicy = {
  // Deliberately generous for shared NATs; account limits provide the tighter protection.
  ip: { maxRequests: 100, windowMs: 15 * 60_000 },
  account: [
    { maxRequests: 5, windowMs: 60_000 },
    { maxRequests: 10, windowMs: 15 * 60_000 },
    { maxRequests: 20, windowMs: 60 * 60_000 },
  ],
  global: { maxRequests: 10_000, windowMs: 60_000 },
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitStore = {
  increment(key: string, windowMs: number): Promise<number>;
};

export type RateLimitMode = 'redis' | 'local-degraded';

export type RateLimitObservability = {
  recordRequest(mode: RateLimitMode, route: string): void;
  modeChanged(mode: RateLimitMode, error?: unknown): void;
};

export type SensitiveRateLimitOptions = {
  fallbackStore?: RateLimitStore;
  observability?: RateLimitObservability;
};

export type MinimalRedis = {
  eval(script: string, numberOfKeys: number, key: string, ttlMs: string): Promise<unknown>;
};

const ATOMIC_INCREMENT_WITH_TTL_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

function getRequestPath(request: ApiRequest): string {
  const url = request.url ?? '';

  return url.split('?')[0] ?? '';
}

function getClientKey(request: ApiRequest): string {
  return request.ip || request.socket.remoteAddress || 'unknown';
}

function isRateLimitedRoute(request: ApiRequest): boolean {
  return request.method === 'POST' && sensitiveRateLimitedRoutes.has(getRequestPath(request));
}

function getNormalizedAccountKey(request: ApiRequest, requestPath: string): string | undefined {
  if (!accountRateLimitedRoutes.has(requestPath) || !request.body || typeof request.body !== 'object') return undefined;

  const body = request.body as Record<string, unknown>;
  if (typeof body.organizationId !== 'string' || typeof body.email !== 'string') return undefined;

  const organizationId = body.organizationId.trim().toLowerCase();
  const email = body.email.trim().toLowerCase();
  if (!organizationId || !email) return undefined;

  // Avoid storing account identifiers as plaintext in Redis keys.
  return createHash('sha256').update(`${organizationId}\0${email}`).digest('hex');
}

function ruleKey(scope: string, route: string, rule: RateLimitRule): string {
  return `${scope}:${route}:${rule.windowMs}`;
}

export function createInMemoryRateLimitStore(now = () => Date.now()): RateLimitStore {
  const attempts = new Map<string, RateLimitEntry>();

  return {
    async increment(key: string, windowMs: number): Promise<number> {
      const currentTime = now();
      const entry = attempts.get(key);

      if (!entry || entry.resetAt <= currentTime) {
        attempts.set(key, { count: 1, resetAt: currentTime + windowMs });
        return 1;
      }

      entry.count += 1;
      return entry.count;
    },
  };
}

export function createRedisRateLimitStore(redis: MinimalRedis, namespace = 'lms'): RateLimitStore {
  return {
    async increment(key: string, windowMs: number): Promise<number> {
      const result = await redis.eval(
        ATOMIC_INCREMENT_WITH_TTL_SCRIPT,
        1,
        `${namespace}:rate-limit:${key}`,
        String(Math.ceil(windowMs)),
      );
      const count = Number(result);
      if (!Number.isSafeInteger(count) || count < 1) {
        throw new Error('Redis rate limit store returned an invalid counter');
      }
      return count;
    },
  };
}

export function createSecurityHeadersMiddleware(): Middleware {
  return (_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    response.setHeader('X-XSS-Protection', '0');

    next();
  };
}

export function createSensitiveRouteRateLimitMiddleware(
  store?: RateLimitStore,
  policy: SensitiveRateLimitPolicy = DEFAULT_SENSITIVE_RATE_LIMIT_POLICY,
  options: SensitiveRateLimitOptions = {},
): Middleware {
  const resolvedStore = store ?? createInMemoryRateLimitStore();
  const fallbackStore = options.fallbackStore ?? createInMemoryRateLimitStore();
  let degraded = false;

  return async (request, response, next) => {
    if (!isRateLimitedRoute(request)) {
      next();
      return;
    }

    const requestPath = getRequestPath(request);
    const accountKey = getNormalizedAccountKey(request, requestPath);
    const rules = [
      { key: ruleKey(`ip:${getClientKey(request)}`, requestPath, policy.ip), rule: policy.ip },
      { key: `global:${policy.global.windowMs}`, rule: policy.global },
      ...(accountKey
        ? policy.account.map((rule) => ({ key: ruleKey(`account:${accountKey}`, requestPath, rule), rule }))
        : []),
    ];

    let counts: number[];
    try {
      counts = await Promise.all(rules.map(({ key, rule }) => resolvedStore.increment(key, rule.windowMs)));
      options.observability?.recordRequest('redis', requestPath);
      if (degraded) {
        degraded = false;
        options.observability?.modeChanged('redis');
      }
    } catch (error) {
      counts = await Promise.all(rules.map(({ key, rule }) => fallbackStore.increment(key, rule.windowMs)));
      options.observability?.recordRequest('local-degraded', requestPath);
      if (!degraded) {
        degraded = true;
        options.observability?.modeChanged('local-degraded', error);
      }
    }

    if (counts.some((count, index) => count > (rules[index]?.rule.maxRequests ?? 0))) {
      response.statusCode = TOO_MANY_REQUESTS_STATUS;
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify(
          createApiErrorResponse({
            statusCode: TOO_MANY_REQUESTS_STATUS,
            code: TOO_MANY_REQUESTS_CODE,
            message: TOO_MANY_REQUESTS_MESSAGE,
            path: request.url ?? requestPath,
          }),
        ),
      );
      return;
    }

    next();
  };
}
