import type { IncomingMessage, ServerResponse } from 'node:http';

import { createApiErrorResponse } from '../api-response.js';

type NextFunction = () => void;

type ApiRequest = IncomingMessage & {
  ip?: string;
  socket: IncomingMessage['socket'] & {
    remoteAddress?: string;
  };
};

type ApiResponse = ServerResponse & {
  setHeader(name: string, value: string | string[]): ApiResponse;
};

type Middleware = (request: ApiRequest, response: ApiResponse, next: NextFunction) => void;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const TOO_MANY_REQUESTS_STATUS = 429;
const TOO_MANY_REQUESTS_CODE = 'TOO_MANY_REQUESTS';
const TOO_MANY_REQUESTS_MESSAGE = 'Too many requests';

const sensitiveRateLimitedRoutes = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/password-reset/request',
  '/api/v1/auth/password-reset/confirm',
  '/api/v1/organizations/register',
]);

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitStore = {
  increment(key: string, windowMs: number): Promise<number>;
};

export type MinimalRedis = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
};

function getRequestPath(request: ApiRequest): string {
  const url = request.url ?? '';

  return url.split('?')[0] ?? '';
}

function getClientKey(request: ApiRequest): string {
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedClient = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0];

  return forwardedClient?.trim() || request.ip || request.socket.remoteAddress || 'unknown';
}

function isRateLimitedRoute(request: ApiRequest): boolean {
  return request.method === 'POST' && sensitiveRateLimitedRoutes.has(getRequestPath(request));
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

export function createRedisRateLimitStore(redis: MinimalRedis): RateLimitStore {
  return {
    async increment(key: string, windowMs: number): Promise<number> {
      const windowSeconds = Math.ceil(windowMs / 1000);
      const count = await redis.incr(key);

      if (count === 1) {
        await redis.expire(key, windowSeconds);
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

export function createSensitiveRouteRateLimitMiddleware(store?: RateLimitStore): Middleware {
  const resolvedStore = store ?? createInMemoryRateLimitStore();

  return async (request, response, next) => {
    if (!isRateLimitedRoute(request)) {
      next();
      return;
    }

    const requestPath = getRequestPath(request);
    const key = `ratelimit:${getClientKey(request)}:${requestPath}`;

    try {
      const count = await resolvedStore.increment(key, RATE_LIMIT_WINDOW_MS);

      if (count > RATE_LIMIT_MAX_REQUESTS) {
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
    } catch {
      // store unavailable — fail open to avoid blocking all traffic
    }

    next();
  };
}
