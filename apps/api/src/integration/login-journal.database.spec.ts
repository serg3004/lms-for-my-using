/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 494: the journal of sign-ins, "my devices", the administrator's view and the retention period.
const PASSWORD = 'Jour1!Jour1Pass';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

describe('login journal and devices — database', () => {
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
  const signIn = (email: string, password: string, agent = CHROME) => send('POST', '/auth/login', { organizationId, email, password }, { 'user-agent': agent });
  async function headersFor(email: string, agent = CHROME) {
    const body = (await (await signIn(email, PASSWORD, agent)).json()) as { accessToken?: string; data?: { accessToken: string } };
    return { authorization: `Bearer ${body.accessToken ?? body.data?.accessToken}` };
  }
  const items = async <T,>(response: Response) => {
    const body = (await response.json()) as T[] | { data: T[] };
    return Array.isArray(body) ? body : body.data;
  };

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
    organizationId = (await prisma.organization.create({ data: { name: `Journal ${runId}`, slug: `journal-${runId}` } })).id;
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

  it('writes sign-ins to the journal with a short device label and a cut address, never the raw agent', async () => {
    const worker = await createUser('journal', 'learner');

    await signIn(worker.email, 'Wrong1!Wrong1');
    expect((await signIn(worker.email, PASSWORD)).status).toBe(201);

    const events = await prisma.loginEvent.findMany({ where: { userId: worker.id }, orderBy: { createdAt: 'asc' } });
    expect(events.map((event) => event.outcome)).toEqual(['failed', 'success']);
    expect(events[1]?.deviceLabel).toBe('Chrome · Windows');
    expect(events[1]?.ipMasked ?? '127.0.x.x').toMatch(/^127\.0\.x\.x$|^::1/);
    expect(JSON.stringify(events)).not.toContain('AppleWebKit');
    const session = await prisma.session.findFirstOrThrow({ where: { userId: worker.id } });
    expect(session.deviceLabel).toBe('Chrome · Windows');
    expect(JSON.stringify(session)).not.toContain('AppleWebKit');
  });

  it('records a refused attempt during a lock and the attempt that locked', async () => {
    const worker = await createUser('locked', 'learner');
    await prisma.organization.update({ where: { id: organizationId }, data: { loginMaxFailures: 3 } });
    for (const wrong of ['Wrong1!Wrong1', 'Wrong2!Wrong2', 'Wrong3!Wrong3']) await signIn(worker.email, wrong);
    await signIn(worker.email, PASSWORD);
    await prisma.organization.update({ where: { id: organizationId }, data: { loginMaxFailures: 5 } });

    const outcomes = (await prisma.loginEvent.findMany({ where: { userId: worker.id }, orderBy: { createdAt: 'asc' } })).map((event) => event.outcome);
    expect(outcomes).toEqual(['failed', 'failed', 'locked', 'blocked']);
  });

  it('shows my devices with the current one marked, ends another one, and never touches another person\'s session', async () => {
    const worker = await createUser('devices', 'learner');
    const other = await createUser('other', 'learner');
    const laptop = await headersFor(worker.email, CHROME);
    const phone = await headersFor(worker.email, PHONE);
    const strangers = await headersFor(other.email, CHROME);

    const list = await items<{ id: string; current: boolean; deviceLabel: string }>(await send('GET', '/auth/me/sessions', undefined, laptop));
    expect(list).toHaveLength(2);
    expect(list.filter((session) => session.current)).toHaveLength(1);
    expect(list.find((session) => session.current)?.deviceLabel).toBe('Chrome · Windows');
    const phoneSession = list.find((session) => !session.current)!;
    expect(phoneSession.deviceLabel).toBe('Safari · iOS');
    const strangerSession = await prisma.session.findFirstOrThrow({ where: { userId: other.id } });

    expect((await send('DELETE', `/auth/me/sessions/${strangerSession.id}`, undefined, laptop)).status).toBe(404);
    expect((await send('GET', '/auth/me', undefined, strangers)).status).toBe(200);
    expect((await send('DELETE', `/auth/me/sessions/${list.find((session) => session.current)!.id}`, undefined, laptop)).status).toBe(404);

    expect((await send('DELETE', `/auth/me/sessions/${phoneSession.id}`, undefined, laptop)).status).toBe(200);
    expect((await send('GET', '/auth/me', undefined, phone)).status).toBe(401);
    expect((await send('GET', '/auth/me', undefined, laptop)).status).toBe(200);
    expect(await items(await send('GET', '/auth/me/sessions', undefined, laptop))).toHaveLength(1);
  });

  it('lets an administrator read a person\'s journal and end their sessions, and nobody else', async () => {
    const admin = await createUser('admin', 'admin');
    const worker = await createUser('watched', 'learner');
    const adminHeaders = await headersFor(admin.email);
    const first = await headersFor(worker.email);
    const second = await headersFor(worker.email, PHONE);

    const history = (await (await send('GET', `/users/${worker.id}/login-history`, undefined, adminHeaders)).json()) as { events?: unknown[]; sessions?: { id: string }[]; data?: { events: unknown[]; sessions: { id: string }[] } };
    const view = history.data ?? { events: history.events ?? [], sessions: history.sessions ?? [] };
    expect(view.events).toHaveLength(2);
    expect(view.sessions).toHaveLength(2);

    expect((await send('DELETE', `/users/${worker.id}/sessions/${view.sessions[0]!.id}`, undefined, adminHeaders)).status).toBe(200);
    expect((await send('POST', `/users/${worker.id}/sessions/revoke`, undefined, adminHeaders)).status).toBe(201);
    expect((await send('GET', '/auth/me', undefined, first)).status).toBe(401);
    expect((await send('GET', '/auth/me', undefined, second)).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'user.sessions_revoked', targetId: worker.id } })).toBe(2);

    const learner = await headersFor(worker.email);
    expect((await send('GET', `/users/${admin.id}/login-history`, undefined, learner)).status).toBe(403);
    expect((await send('POST', `/users/${admin.id}/sessions/revoke`, undefined, learner)).status).toBe(403);
  });

  it('keeps events for at least 90 days: the limit cannot be lowered, a longer period is kept and the cleanup respects it', async () => {
    const admin = await createUser('retention', 'admin');
    const headers = await headersFor(admin.email);
    const base = { maxFailures: 5, windowMinutes: 15, lockMinutes: 15 };
    const patch = (body: unknown) => send('PATCH', `/organizations/${organizationId}/login-protection`, body, headers);

    expect((await patch({ ...base, logRetentionDays: 30 })).status).toBe(400);
    expect((await patch({ ...base, logRetentionDays: 200 })).status).toBe(200);
    // Omitting the period keeps the stored one.
    expect((await patch(base)).status).toBe(200);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } })).loginLogRetentionDays).toBe(200);

    const { purgeLoginEvents } = await import('../modules/auth/login-journal.js');
    const day = 24 * 60 * 60_000;
    await prisma.loginEvent.createMany({ data: [
      { organizationId, userId: admin.id, outcome: 'success', createdAt: new Date(Date.now() - 150 * day) },
      { organizationId, userId: admin.id, outcome: 'success', createdAt: new Date(Date.now() - 250 * day) },
    ] });
    expect(await purgeLoginEvents(prisma, true)).toBeGreaterThanOrEqual(1);
    await purgeLoginEvents(prisma, false);
    const ages = (await prisma.loginEvent.findMany({ where: { userId: admin.id } })).map((event) => (Date.now() - event.createdAt.getTime()) / day);
    expect(ages.some((age) => age > 200)).toBe(false);
    expect(ages.some((age) => age > 140 && age < 160)).toBe(true);
    await prisma.organization.update({ where: { id: organizationId }, data: { loginLogRetentionDays: 90 } });
  });
});
