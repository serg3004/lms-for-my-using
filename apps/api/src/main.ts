import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/filters/api-exception.filter.js';
import {
  createSecurityHeadersMiddleware,
  createSensitiveRouteRateLimitMiddleware,
} from './common/middleware/api-hardening.js';
import { loadApiEnv } from './config/env.js';

type ExpressLikeServer = {
  disable?: (setting: string) => void;
};

async function bootstrap(): Promise<void> {
  const apiEnv = loadApiEnv();
  const app = await NestFactory.create(AppModule);

  const server = app.getHttpAdapter().getInstance() as ExpressLikeServer;
  server.disable?.('x-powered-by');

  app.enableCors({
    origin: apiEnv.FRONTEND_URL,
  });
  app.use(createSecurityHeadersMiddleware());
  app.use(createSensitiveRouteRateLimitMiddleware());
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());

  await app.listen(apiEnv.API_PORT);
}

void bootstrap();
