import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
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

  if (apiEnv.SENTRY_DSN) {
    const Sentry = await import('@sentry/node');
    Sentry.init({ dsn: apiEnv.SENTRY_DSN, environment: apiEnv.NODE_ENV });
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

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

  app.use(createSecurityHeadersMiddleware());
  app.use(createSensitiveRouteRateLimitMiddleware(rateLimitStore));
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
