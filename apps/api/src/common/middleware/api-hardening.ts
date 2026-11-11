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
const SERVICE_UNAVAILABLE_STATUS = 503;
const RATE_LIMIT_UNAVAILABLE_CODE = 'RATE_LIMIT_UNAVAILABLE';
const RATE_LIMIT_UNAVAILABLE_MESSAGE = 'Authentication service temporarily unavailable';
const API_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "img-src 'none'",
  "font-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');

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

/**
 * PR 465: the guest side of a checklist link has no account to limit, so it is limited by client address: opening and
 * requesting a code, starting a pass, sending the result, and (loosely) every other save of a pass. The token in the path
 * is never part of a key or a metric label.
 */
export type PublicChecklistRouteKind = 'open' | 'start' | 'finish' | 'pass';

export const DEFAULT_PUBLIC_CHECKLIST_RATE_LIMITS: Record<PublicChecklistRouteKind, RateLimitRule> = {
  open: { maxRequests: 120, windowMs: 15 * 60_000 },
  start: { maxRequests: 20, windowMs: 15 * 60_000 },
  finish: { maxRequests: 20, windowMs: 15 * 60_000 },
  pass: { maxRequests: 1200, windowMs: 15 * 60_000 },
};

const PUBLIC_CHECKLIST_PATH = /^\/api\/v1\/public\/checklists\/[^/]+(\/.*)?$/;

export function matchPublicChecklistRoute(method: string | undefined, path: string): { kind: PublicChecklistRouteKind; route: string } | undefined {
  const match = PUBLIC_CHECKLIST_PATH.exec(path);
  if (!match) return undefined;
  const rest = match[1] ?? '';
  const prefix = '/api/v1/public/checklists/:token';
  if (method === 'GET' && (rest === '' || rest === '/captcha')) return { kind: 'open', route: `${prefix}${rest}` };
  if (method === 'POST' && rest === '/start') return { kind: 'start', route: `${prefix}/start` };
  if (method === 'POST' && /^\/passes\/[^/]+\/finish$/.test(rest)) return { kind: 'finish', route: `${prefix}/passes/:id/finish` };
  // Signing in is a different gate (its own session); everything else of a pass is a save.
  if (rest === '/start-signed-in') return undefined;
  if (rest.startsWith('/passes/')) return { kind: 'pass', route: `${prefix}/passes/:id/...` };
  return undefined;
}

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitStore = {
  increment(key: string, windowMs: number): Promise<number>;
};

export type InMemoryRateLimitStore = RateLimitStore & {
  /** Exposed for tests: the number of tracked keys, expired or not, currently held in memory. */
  size(): number;
};

export type RateLimitMode = 'redis' | 'redis-unavailable';

export type RateLimitObservability = {
  recordRequest(mode: RateLimitMode, route: string): void;
  rejected?(mode: RateLimitMode, route: string): void;
  modeChanged(mode: RateLimitMode, error?: unknown): void;
};

export type SensitiveRateLimitOptions = {
  observability?: RateLimitObservability;
  publicChecklistLimits?: Record<PublicChecklistRouteKind, RateLimitRule>;
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

// Rechecked every this-many writes so a sustained attack (rotating IPs/emails against
// login or register) can't grow this Map without bound for the life of the process —
// it's the primary store in STARTUP-IN-MEMORY mode and the fallback during a Redis outage,
// both of which can last as long as the process runs.
const IN_MEMORY_STORE_SWEEP_INTERVAL = 5_000;

export function createInMemoryRateLimitStore(now = () => Date.now()): InMemoryRateLimitStore {
  const attempts = new Map<string, RateLimitEntry>();
  let writesSinceSweep = 0;

  function sweepExpired(currentTime: number): void {
    for (const [key, entry] of attempts) {
      if (entry.resetAt <= currentTime) attempts.delete(key);
    }
  }

  return {
    async increment(key: string, windowMs: number): Promise<number> {
      const currentTime = now();
      const entry = attempts.get(key);

      if (!entry || entry.resetAt <= currentTime) {
        attempts.set(key, { count: 1, resetAt: currentTime + windowMs });
        writesSinceSweep += 1;
        if (writesSinceSweep >= IN_MEMORY_STORE_SWEEP_INTERVAL) {
          writesSinceSweep = 0;
          sweepExpired(currentTime);
        }
        return 1;
      }

      entry.count += 1;
      return entry.count;
    },
    size(): number {
      return attempts.size;
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
    // TLS is terminated by the trusted production proxy. Browsers ignore HSTS
    // when this same application is reached over plain HTTP during development.
    response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    response.setHeader('Content-Security-Policy', API_CONTENT_SECURITY_POLICY);
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
  let redisUnavailable = false;

  const publicLimits = options.publicChecklistLimits ?? DEFAULT_PUBLIC_CHECKLIST_RATE_LIMITS;

  return async (request, response, next) => {
    const publicRoute = matchPublicChecklistRoute(request.method, getRequestPath(request));
    if (!publicRoute && !isRateLimitedRoute(request)) {
      next();
      return;
    }

    // A guest route is keyed and labelled by its pattern, never by the token it carries.
    const requestPath = publicRoute ? publicRoute.route : getRequestPath(request);
    const accountKey = publicRoute ? undefined : getNormalizedAccountKey(request, requestPath);
    const publicRule = publicRoute ? publicLimits[publicRoute.kind] : undefined;
    const rules = [
      ...(publicRule
        ? [{ key: ruleKey(`ip:${getClientKey(request)}`, requestPath, publicRule), rule: publicRule }]
        : [{ key: ruleKey(`ip:${getClientKey(request)}`, requestPath, policy.ip), rule: policy.ip }]),
      { key: `global:${policy.global.windowMs}`, rule: policy.global },
      ...(accountKey
        ? policy.account.map((rule) => ({ key: ruleKey(`account:${accountKey}`, requestPath, rule), rule }))
        : []),
    ];

    let counts: number[];
    try {
      counts = await Promise.all(rules.map(({ key, rule }) => resolvedStore.increment(key, rule.windowMs)));
      options.observability?.recordRequest('redis', requestPath);
      if (redisUnavailable) {
        redisUnavailable = false;
        options.observability?.modeChanged('redis');
      }
    } catch (error) {
      // A configured Redis store is the only shared authority across API replicas.
      // Falling back to process-local counters here would multiply every limit by
      // the replica count. Fail closed for security-critical routes instead. When
      // no store is configured, resolvedStore is intentionally in-memory from
      // startup and this branch is not involved.
      options.observability?.recordRequest('redis-unavailable', requestPath);
      options.observability?.rejected?.('redis-unavailable', requestPath);
      if (!redisUnavailable) {
        redisUnavailable = true;
        options.observability?.modeChanged('redis-unavailable', error);
      }
      response.statusCode = SERVICE_UNAVAILABLE_STATUS;
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Retry-After', '1');
      response.end(
        JSON.stringify(
          createApiErrorResponse({
            statusCode: SERVICE_UNAVAILABLE_STATUS,
            code: RATE_LIMIT_UNAVAILABLE_CODE,
            message: RATE_LIMIT_UNAVAILABLE_MESSAGE,
            path: request.url ?? requestPath,
          }),
        ),
      );
      return;
    }

    if (counts.some((count, index) => count > (rules[index]?.rule.maxRequests ?? 0))) {
      options.observability?.rejected?.('redis', requestPath);
      response.statusCode = TOO_MANY_REQUESTS_STATUS;
      response.setHeader('Content-Type', 'application/json');
      // The store only counts, so the wait is the whole window: an upper bound, never a shorter promise than the truth.
      const retryAfterSeconds = publicRule ? Math.ceil(publicRule.windowMs / 1000) : undefined;
      if (retryAfterSeconds !== undefined) response.setHeader('Retry-After', String(retryAfterSeconds));
      response.end(
        JSON.stringify(
          createApiErrorResponse({
            statusCode: TOO_MANY_REQUESTS_STATUS,
            code: TOO_MANY_REQUESTS_CODE,
            message: retryAfterSeconds === undefined ? TOO_MANY_REQUESTS_MESSAGE : `${TOO_MANY_REQUESTS_MESSAGE}, try again in at most ${retryAfterSeconds} seconds`,
            path: publicRoute ? requestPath : request.url ?? requestPath,
            ...(retryAfterSeconds === undefined ? {} : { details: [{ field: 'retryAfterSeconds', code: 'RETRY_AFTER', message: String(retryAfterSeconds) }] }),
          }),
        ),
      );
      return;
    }

    next();
  };
}
