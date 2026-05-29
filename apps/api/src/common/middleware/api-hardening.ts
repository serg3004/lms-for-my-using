import type { IncomingMessage, ServerResponse } from 'node:http';

type NextFunction = () => void;

type ApiRequest = IncomingMessage & {
  ip?: string;
  socket: IncomingMessage['socket'] &{
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

export function createSensitiveRouteRateLimitMiddleware(now = () => Date.now()): Middleware {
  const attempts = new Map<string, RateLimitEntry>();

  return (request, response, next) => {
    if (!isRateLimitedRoute(request)) {
      next();
      return;
    }

    const currentTime = now();
    const key = `${getClientKey(request)}:${getRequestPath(request)}`;
    const currentEntry = attempts.get(key);

    if (!currentEntry || currentEntry.resetAt <= currentTime) {
      attempts.set(key, {
        count: 1,
        resetAt: currentTime + RATE_LIMIT_WINDOW_MS,
      });
      next();
      return;
    }

    if (currentEntry.count >= RATE_LIMIT_MAX_REQUESTS) {
      response.statusCode = TOO_MANY_REQUESTS_STATUS;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ error: 'TOO_MANY_REQUESTS' }));
      return;
    }

    currentEntry.count += 1;
    next();
  };
}
