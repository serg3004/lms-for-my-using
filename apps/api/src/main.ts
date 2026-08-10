// Must be the first dependency: instrumentation patches libraries before Nest loads them.
import './common/observability/tracing.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Redis } from 'ioredis';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/filters/api-exception.filter.js';
import {
  createRedisRateLimitStore,
  createSecurityHeadersMiddleware,
  createSensitiveRouteRateLimitMiddleware,
} from './common/middleware/api-hardening.js';
import { handleStartupError } from './common/startup.js';
import { createTelemetryContextMiddleware } from './common/telemetry/telemetry-context.js';
import { createHttpMetricsMiddleware, rateLimitRejects, redisErrors } from './common/observability/metrics.js';
import { stopTracing } from './common/observability/tracing.js';
import { loadApiEnv, loadLocalEnvFiles } from './config/env.js';

type ExpressLikeServer = {
  disable?: (setting: string) => void;
  set?: (setting: string, value: unknown) => void;
};

async function closeRedis(redis: Redis | undefined): Promise<void> {
  if (!redis) return;
  await redis.quit();
}

async function bootstrap(): Promise<void> {
  loadLocalEnvFiles();
  const apiEnv = loadApiEnv();
  let captureRateLimitFailure: ((error: unknown) => void) | undefined;

  if (apiEnv.SENTRY_DSN) {
    const Sentry = await import('@sentry/node');
    Sentry.init({ dsn: apiEnv.SENTRY_DSN, environment: apiEnv.NODE_ENV });
    captureRateLimitFailure = (error) => Sentry.captureException(error, { tags: { component: 'rate-limit' } });
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, bodyParser: false });
  app.useLogger(app.get(Logger));

  // Account-aware limiting needs the normalized login/reset identity before controllers run.
  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });

  const server = app.getHttpAdapter().getInstance() as ExpressLikeServer;
  if (server.disable) {
    server.disable('x-powered-by');
  }
  server.set?.('trust proxy', apiEnv.TRUST_PROXY);

  // Must run before request logging and application middleware so every downstream
  // operation observes the same validated correlation ID.
  app.use(createTelemetryContextMiddleware());
  app.use(createHttpMetricsMiddleware());

  app.enableCors({
    origin: apiEnv.FRONTEND_URL,
    credentials: true,
    exposedHeaders: ['X-Request-ID'],
  });
  const redis = apiEnv.REDIS_URL ? new Redis(apiEnv.REDIS_URL) : undefined;
  const rateLimitStore = redis ? createRedisRateLimitStore(redis, apiEnv.RATE_LIMIT_NAMESPACE) : undefined;
  const logger = app.get(Logger);

  if (!redis && apiEnv.NODE_ENV === 'production') {
    // Only reachable when ALLOW_IN_MEMORY_RATE_LIMIT=true — env.ts otherwise requires REDIS_URL
    // in production. Surface it loudly: this escape hatch is easy to set on Railway and forget.
    logger.warn(
      { event: 'rate_limit_in_memory_fallback', alert: true },
      'ALLOW_IN_MEMORY_RATE_LIMIT is active: running production without Redis. Rate limit counters are per-instance and reset on restart.',
    );
  }

  app.use(createSecurityHeadersMiddleware());
  app.use(
    createSensitiveRouteRateLimitMiddleware(rateLimitStore, undefined, {
      observability: redis
        ? {
            recordRequest(mode, route) {
              logger.log({ event: 'rate_limit_request_total', mode, route, value: 1 });
            },
            rejected(mode, route) {
              rateLimitRejects.inc({ mode, route });
            },
            modeChanged(mode, error) {
              if (mode === 'local-degraded') {
                redisErrors.inc({ component: 'rate_limiter' });
                logger.error(
                  {
                    event: 'rate_limit_degraded',
                    mode,
                    error: error instanceof Error ? error.message : String(error),
                    alert: true,
                  },
                  'Redis rate limiter unavailable; local emergency limiter activated',
                );
                captureRateLimitFailure?.(error);
                return;
              }
              logger.log(
                { event: 'rate_limit_recovered', mode },
                'Redis rate limiter recovered; distributed limiting restored',
              );
            },
          }
        : undefined,
    }),
  );
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  app.getHttpServer().once('close', () => {
    void closeRedis(redis);
    void stopTracing();
  });

  await app.listen(apiEnv.API_PORT);
}

void bootstrap().catch((error: unknown) => {
  handleStartupError(error);
});
