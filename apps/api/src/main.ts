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
};

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

  app.enableCors({
    origin: apiEnv.FRONTEND_URL,
    credentials: true,
  });
  const rateLimitStore = apiEnv.REDIS_URL ? createRedisRateLimitStore(new Redis(apiEnv.REDIS_URL)) : undefined;

  app.use(createSecurityHeadersMiddleware());
  app.use(createSensitiveRouteRateLimitMiddleware(rateLimitStore));
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();

  await app.listen(apiEnv.API_PORT);
}

void bootstrap().catch((error: unknown) => {
  handleStartupError(error);
});
