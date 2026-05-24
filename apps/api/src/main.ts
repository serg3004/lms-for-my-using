import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { loadApiEnv } from './config/env.js';

async function bootstrap(): Promise<void> {
  const apiEnv = loadApiEnv();
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  await app.listen(apiEnv.API_PORT);
}

void bootstrap();
