import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

const DEFAULT_API_PORT = 3000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.API_PORT ?? DEFAULT_API_PORT);

  app.setGlobalPrefix('api/v1');

  await app.listen(port);
}

void bootstrap();
