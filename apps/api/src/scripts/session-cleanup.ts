import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module.js';
import { PrismaService } from '../database/prisma.service.js';
import { purgeLoginEvents } from '../modules/auth/login-journal.js';
import { AuthSessionStore } from '../modules/auth/auth.session-store.js';

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
try {
  const result = await app.get(AuthSessionStore).cleanupExpired(process.argv[2] !== '--execute');
  // PR 493: failed sign-in counters older than any window an administrator can set.
  const dryRun = process.argv[2] !== '--execute';
  const stale = { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } };
  const prisma = app.get(PrismaService);
  const loginAttempts = dryRun ? await prisma.loginAttempt.count({ where: stale }) : (await prisma.loginAttempt.deleteMany({ where: stale })).count;
  // PR 494: sign-in events past each organization's retention (never below 90 days).
  const loginEvents = await purgeLoginEvents(prisma, dryRun);
  console.log(JSON.stringify({ ...result, loginAttempts, loginEvents }));
} finally {
  await app.close();
}
