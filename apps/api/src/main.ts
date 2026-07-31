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

  app.enableCors({
    origin: apiEnv.FRONTEND_URL,
    credentials: true,
  });
  const redis = apiEnv.REDIS_URL ? new Redis(apiEnv.REDIS_URL) : undefined;
  const rateLimitStore = redis ? createRedisRateLimitStore(redis, apiEnv.RATE_LIMIT_NAMESPACE) : undefined;
  const logger = app.get(Logger);

  app.use(createSecurityHeadersMiddleware());
  app.use(
    createSensitiveRouteRateLimitMiddleware(rateLimitStore, undefined, {
      observability: redis
        ? {
            recordRequest(mode, route) {
              logger.log({ event: 'rate_limit_request_total', mode, route, value: 1 });
            },
            modeChanged(mode, error) {
              if (mode === 'local-degraded') {
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
  });

  await app.listen(apiEnv.API_PORT);
}

void bootstrap().catch((error: unknown) => {
  handleStartupError(error);
});
