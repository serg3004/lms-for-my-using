import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/filters/api-exception.filter.js';
import { loadApiEnv } from './config/env.js';

async function bootstrap(): Promise<void> {
  const apiEnv = loadApiEnv();
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());

  await app.listen(apiEnv.API_PORT);
}

void bootstrap();
