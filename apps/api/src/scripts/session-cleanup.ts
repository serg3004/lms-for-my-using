import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module.js';
import { AuthSessionStore } from '../modules/auth/auth.session-store.js';

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
try {
  const result = await app.get(AuthSessionStore).cleanupExpired(process.argv[2] !== '--execute');
  console.log(JSON.stringify(result));
} finally {
  await app.close();
}
