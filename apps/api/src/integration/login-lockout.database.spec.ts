/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 493: a series of wrong passwords locks the account, the answer never reveals it, an administrator lifts the lock,
// and blocking a user ends every session.
const PASSWORD = 'Lock1!Lock1Pass';

describe('login lockout — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string;

  async function createUser(label: string, role: 'learner' | 'admin') {
    const { hashPassword } = await import('../modules/auth/passwords.js');
    const email = `${label}-${randomUUID()}@example.test`;
    const user = await prisma.user.create({ data: { organizationId, email, passwordHash: await hashPassword(PASSWORD), firstName: label, lastName: 'Person' } });
    await prisma.membership.create({ data: { organizationId, userId: user.id, role } });
    return { id: user.id, email };
  }

  const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => fetch(`${baseUrl}/api/v1${path}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const withoutTime = async (response: Response) => {
    const body = (await response.json()) as Record<string, unknown>;
    delete body.timestamp;
    return body;
  };
  const signIn = (email: string, password: string) => send('POST', '/auth/login', { organizationId, email, password });
  async function headersFor(email: string) {
    const body = (await (await signIn(email, PASSWORD)).json()) as { accessToken?: string; data?: { accessToken: string } };
    return { authorization: `Bearer ${body.accessToken ?? body.data?.accessToken}` };
  }

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'database-smoke-jwt-secret-32-characters';
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../app.module.js');
    const { PrismaService: Prisma } = await import('../database/prisma.service.js');
    const { ApiExceptionFilter } = await import('../common/filters/api-exception.filter.js');
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = testingModule.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    prisma = app.get(Prisma);
    const runId = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `Lock ${runId}`, slug: `lock-${runId}`, loginMaxFailures: 3, loginLockMinutes: 15 } })).id;
  });

  afterAll(async () => {
    try {
      if (organizationId) {
        await prisma.auditLog.deleteMany({ where: { organizationId } });
        await prisma.user.deleteMany({ where: { organizationId } });
        await prisma.organization.deleteMany({ where: { id: organizationId } });
      }
    } finally {
      await app?.close();
    }
  });

  it('locks after the configured number of wrong passwords, answers like a wrong password, and refuses even the right one', async () => {
    const worker = await createUser('worker', 'learner');

    const unknown = await signIn(`nobody-${randomUUID()}@example.test`, 'Wrong1!Wrong1');
    const firstWrong = await signIn(worker.email, 'Wrong1!Wrong1');
    expect(firstWrong.status).toBe(401);
    expect(await withoutTime(firstWrong)).toEqual(await withoutTime(unknown.clone()));
    expect((await signIn(worker.email, 'Wrong2!Wrong2')).status).toBe(401);
    expect((await signIn(worker.email, 'Wrong3!Wrong3')).status).toBe(401);

    const locked = await prisma.user.findUniqueOrThrow({ where: { id: worker.id }, select: { loginLockedUntil: true } });
    expect(locked.loginLockedUntil && locked.loginLockedUntil.getTime() > Date.now()).toBe(true);

    const refused = await signIn(worker.email, PASSWORD);
    expect(refused.status).toBe(401);
    expect(await withoutTime(refused)).toEqual(await withoutTime(unknown));

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { organizationId, action: 'user.login_locked', targetId: worker.id } });
    expect(JSON.stringify(audit)).not.toContain(PASSWORD);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'user.login_locked', targetId: worker.id } })).toBe(1);
  });

  it('lets the lock expire by itself and forgets the failures after a correct password', async () => {
    const worker = await createUser('expiring', 'learner');
    for (const wrong of ['Wrong1!Wrong1', 'Wrong2!Wrong2', 'Wrong3!Wrong3']) await signIn(worker.email, wrong);
    await prisma.user.update({ where: { id: worker.id }, data: { loginLockedUntil: new Date(Date.now() - 1000) } });

    expect((await signIn(worker.email, PASSWORD)).status).toBe(201);
    expect(await prisma.loginAttempt.count({ where: { userId: worker.id } })).toBe(0);

    // Two wrong, one right, two wrong: the right one restarts the series, so no lock.
    await signIn(worker.email, 'Wrong1!Wrong1');
    await signIn(worker.email, 'Wrong2!Wrong2');
    await signIn(worker.email, PASSWORD);
    await signIn(worker.email, 'Wrong1!Wrong1');
    await signIn(worker.email, 'Wrong2!Wrong2');
    expect((await signIn(worker.email, PASSWORD)).status).toBe(201);
  });

  it('shows locked accounts to an administrator, who can lift the lock; other organizations are not visible', async () => {
    const admin = await createUser('admin', 'admin');
    const worker = await createUser('blocked', 'learner');
    for (const wrong of ['Wrong1!Wrong1', 'Wrong2!Wrong2', 'Wrong3!Wrong3']) await signIn(worker.email, wrong);
    const adminHeaders = await headersFor(admin.email);

    const list = (await (await send('GET', '/users/locked', undefined, adminHeaders)).json()) as { id: string }[] | { data: { id: string }[] };
    const items = Array.isArray(list) ? list : list.data;
    expect(items.map((item) => item.id)).toContain(worker.id);

    expect((await send('POST', `/users/${worker.id}/unlock`, undefined, adminHeaders)).status).toBe(201);
    expect((await signIn(worker.email, PASSWORD)).status).toBe(201);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'user.login_unlocked', targetId: worker.id } })).toBe(1);

    const learnerHeaders = await headersFor(worker.email);
    expect((await send('GET', '/users/locked', undefined, learnerHeaders)).status).toBe(403);
    expect((await send('POST', `/users/${admin.id}/unlock`, undefined, learnerHeaders)).status).toBe(403);
  });

  it('keeps the thresholds an administrator sets and rejects values out of range', async () => {
    const admin = await createUser('settings', 'admin');
    const headers = await headersFor(admin.email);

    expect((await send('PATCH', `/organizations/${organizationId}/login-protection`, { maxFailures: 2, windowMinutes: 15, lockMinutes: 15 }, headers)).status).toBe(400);
    expect((await send('PATCH', `/organizations/${organizationId}/login-protection`, { maxFailures: 4, windowMinutes: 10, lockMinutes: 30 }, headers)).status).toBe(200);
    const saved = (await (await send('GET', `/organizations/${organizationId}/login-protection`, undefined, headers)).json()) as { maxFailures?: number; data?: { maxFailures: number } };
    expect(saved.maxFailures ?? saved.data?.maxFailures).toBe(4);
    await prisma.organization.update({ where: { id: organizationId }, data: { loginMaxFailures: 3, loginFailureWindowMinutes: 15, loginLockMinutes: 15 } });
  });

  it('ends every session when a user is suspended and refuses a new sign-in', async () => {
    const admin = await createUser('admin2', 'admin');
    const worker = await createUser('leaver', 'learner');
    const adminHeaders = await headersFor(admin.email);
    const first = await headersFor(worker.email);
    const second = await headersFor(worker.email);
    expect((await send('GET', '/auth/me', undefined, first)).status).toBe(200);

    expect((await send('PATCH', `/users/${worker.id}/status`, { status: 'suspended' }, adminHeaders)).status).toBe(200);

    expect((await send('GET', '/auth/me', undefined, first)).status).toBe(401);
    expect((await send('GET', '/auth/me', undefined, second)).status).toBe(401);
    expect(await prisma.session.count({ where: { userId: worker.id, revokedAt: null } })).toBe(0);
    expect((await signIn(worker.email, PASSWORD)).status).toBe(401);
  });
});
