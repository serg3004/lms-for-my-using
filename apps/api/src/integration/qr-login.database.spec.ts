/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 505: sign-in on a device without a password, confirmed on a phone that is already signed in — real HTTP stack and Postgres.
const PASSWORD = 'Invite1!Invite';

describe('sign-in by QR confirmed on a phone — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string;
  let slug: string;
  let adminHeaders: Record<string, string>;
  let learnerId: string;
  let learnerHeaders: Record<string, string>;
  let adminEmail: string;
  let learnerEmail: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'database-smoke-jwt-secret-32-characters';
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../app.module.js');
    const { PrismaService: Prisma } = await import('../database/prisma.service.js');
    const { ApiExceptionFilter } = await import('../common/filters/api-exception.filter.js');
    const { createSensitiveRouteRateLimitMiddleware } = await import('../common/middleware/api-hardening.js');
    const { hashPassword } = await import('../modules/auth/passwords.js');
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const express = testingModule.createNestApplication<NestExpressApplication>({ bodyParser: false });
    express.useBodyParser('json');
    express.use(createSensitiveRouteRateLimitMiddleware());
    app = express;
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    prisma = app.get(Prisma);
    const runId = randomUUID();
    slug = `qr-${runId}`;
    organizationId = (await prisma.organization.create({ data: { name: `Qr ${runId}`, slug } })).id;
    adminEmail = `admin-${runId}@example.test`;
    learnerEmail = `learner-${runId}@example.test`;
    const admin = await prisma.user.create({ data: { organizationId, email: adminEmail, passwordHash: await hashPassword(PASSWORD), firstName: 'Admin', lastName: 'User' } });
    await prisma.membership.create({ data: { organizationId, userId: admin.id, role: 'admin' } });
    const learner = await prisma.user.create({ data: { organizationId, email: learnerEmail, passwordHash: await hashPassword(PASSWORD), firstName: 'Айгуль', lastName: 'Каримова' } });
    await prisma.membership.create({ data: { organizationId, userId: learner.id, role: 'learner' } });
    learnerId = learner.id;
    adminHeaders = await signIn(adminEmail);
    learnerHeaders = await signIn(learnerEmail);
  });

  afterAll(async () => {
    try {
      if (organizationId) {
        await prisma.qrLoginRequest.deleteMany({ where: { user: { organizationId } } });
        await prisma.auditLog.deleteMany({ where: { organizationId } });
        await prisma.user.deleteMany({ where: { organizationId } });
        await prisma.organization.deleteMany({ where: { id: organizationId } });
      }
      await prisma?.qrLoginRequest.deleteMany({ where: { userId: null } });
    } finally {
      await app?.close();
    }
  });

  const unwrap = async <T>(response: Response) => {
    const body = (await response.json()) as { data?: T } & T;
    return (body.data ?? body) as T;
  };
  async function signIn(email: string) {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId, email, password: PASSWORD }) });
    const body = await unwrap<{ accessToken: string }>(response);
    return { authorization: `Bearer ${body.accessToken}` };
  }
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${baseUrl}/api/v1${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  const patchPolicy = (policy: Record<string, unknown>) => fetch(`${baseUrl}/api/v1/organizations/${organizationId}/qr-login`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', ...adminHeaders }, body: JSON.stringify(policy),
  });
  const start = async () => unwrap<{ code: string; pollToken: string; expiresAt: string }>(await post('/auth/qr/start', {}));
  const status = async (pollToken: string) => unwrap<{ status: string; accessToken?: string }>(await post('/auth/qr/status', { pollToken }));

  it('is closed until an administrator turns it on, and only an administrator turns it on', async () => {
    const request = await start();
    expect((await post('/auth/qr/approve', { code: request.code }, learnerHeaders)).status).toBe(403);
    expect((await status(request.pollToken)).status).toBe('pending');

    const anonymous = await fetch(`${baseUrl}/api/v1/organizations/${organizationId}/qr-login`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true, sessionHours: 8, roles: ['learner'] }),
    });
    expect(anonymous.status).toBe(401);
    const denied = await fetch(`${baseUrl}/api/v1/organizations/${organizationId}/qr-login`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', ...learnerHeaders }, body: JSON.stringify({ enabled: true, sessionHours: 8, roles: ['learner'] }),
    });
    expect(denied.status).toBe(403);
    expect((await patchPolicy({ enabled: true, sessionHours: 8, roles: ['learner'] })).status).toBe(200);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } })).qrLoginEnabled).toBe(true);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'organization.qr_login_updated' } })).toBe(1);
  });

  it('opens a short session on the device once the phone confirms, and the code works only once', async () => {
    const request = await start();
    expect((await status(request.pollToken)).status).toBe('pending');

    const seen = await unwrap<{ deviceLabel: string | null; ipMasked: string | null }>(await post('/auth/qr/inspect', { code: request.code }, learnerHeaders));
    expect(seen).toHaveProperty('ipMasked');
    expect(JSON.stringify(seen)).not.toContain(request.code);
    // Without a session of its own, nobody can look at or confirm a request.
    expect((await post('/auth/qr/inspect', { code: request.code })).status).toBe(401);
    expect((await post('/auth/qr/approve', { code: request.code })).status).toBe(401);

    expect((await post('/auth/qr/approve', { code: request.code }, learnerHeaders)).status).toBe(201);
    // The code cannot be confirmed twice, and the phone's code does not poll for the device.
    expect((await post('/auth/qr/approve', { code: request.code }, learnerHeaders)).status).toBe(404);
    expect((await status(request.code)).status).toBe('expired');

    const opened = await status(request.pollToken);
    expect(opened.status).toBe('approved');
    expect(opened.accessToken).toBeTruthy();
    expect((await status(request.pollToken)).status).toBe('expired');

    const me = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { authorization: `Bearer ${opened.accessToken}` } });
    expect(me.status).toBe(200);
    expect((await unwrap<{ id: string }>(me)).id).toBe(learnerId);

    const session = await prisma.session.findFirstOrThrow({ where: { userId: learnerId, viaQr: true } });
    expect(session.maxExpiresAt).not.toBeNull();
    const hours = (session.maxExpiresAt!.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(7.9);
    expect(hours).toBeLessThanOrEqual(8);
    expect(await prisma.loginEvent.count({ where: { userId: learnerId, outcome: 'qr' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'user.qr_login_approved', actorId: learnerId } })).toBe(1);

    // Nothing secret is stored or written down in clear text.
    const stored = await prisma.qrLoginRequest.findMany({ where: { userId: learnerId } });
    expect(JSON.stringify(stored)).not.toContain(request.code);
    expect(JSON.stringify(stored)).not.toContain(request.pollToken);
    const audit = JSON.stringify(await prisma.auditLog.findMany({ where: { organizationId } }));
    expect(audit).not.toContain(request.code);
    expect(audit).not.toContain(request.pollToken);
  });

  it('does not let a session got by QR confirm another sign-in', async () => {
    const first = await start();
    await post('/auth/qr/approve', { code: first.code }, learnerHeaders);
    const opened = await status(first.pollToken);
    const qrHeaders = { authorization: `Bearer ${opened.accessToken}` };

    const second = await start();
    expect((await post('/auth/qr/approve', { code: second.code }, qrHeaders)).status).toBe(403);
    expect((await status(second.pollToken)).status).toBe('pending');
    // It can still decline a request.
    expect((await post('/auth/qr/deny', { code: second.code }, qrHeaders)).status).toBe(201);
  });

  it('shows a refusal to the device and refuses an old request', async () => {
    const declined = await start();
    expect((await post('/auth/qr/deny', { code: declined.code }, learnerHeaders)).status).toBe(201);
    expect((await status(declined.pollToken)).status).toBe('denied');
    expect((await post('/auth/qr/approve', { code: declined.code }, learnerHeaders)).status).toBe(404);

    const old = await start();
    await prisma.qrLoginRequest.updateMany({ where: { codeHash: { not: '' }, pollHash: { not: '' }, expiresAt: { gt: new Date() }, userId: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await post('/auth/qr/approve', { code: old.code }, learnerHeaders)).status).toBe(404);
    expect((await status(old.pollToken)).status).toBe('expired');
    expect((await post('/auth/qr/inspect', { code: old.code }, learnerHeaders)).status).toBe(404);
    // A made-up code and a code of the wrong shape answer like an old one.
    expect((await post('/auth/qr/approve', { code: 'A'.repeat(43) }, learnerHeaders)).status).toBe(404);
    expect((await post('/auth/qr/approve', { code: 'short' }, learnerHeaders)).status).toBe(400);
    expect((await status('B'.repeat(43))).status).toBe('expired');
  });

  it('refuses roles the administrator did not allow, accounts that must change the password, and a policy switched off after the confirmation', async () => {
    const request = await start();
    expect((await post('/auth/qr/approve', { code: request.code }, adminHeaders)).status).toBe(403);
    expect((await status(request.pollToken)).status).toBe('pending');

    await prisma.user.update({ where: { id: learnerId }, data: { mustChangePassword: true } });
    expect((await post('/auth/qr/approve', { code: request.code }, learnerHeaders)).status).toBe(403);
    await prisma.user.update({ where: { id: learnerId }, data: { mustChangePassword: false } });

    expect((await post('/auth/qr/approve', { code: request.code }, learnerHeaders)).status).toBe(201);
    await patchPolicy({ enabled: false, sessionHours: 8, roles: ['learner'] });
    expect((await status(request.pollToken)).status).toBe('denied');
    await patchPolicy({ enabled: true, sessionHours: 2, roles: ['learner'] });

    const next = await start();
    await prisma.membership.create({ data: { organizationId, userId: learnerId, role: 'manager' } });
    expect((await post('/auth/qr/approve', { code: next.code }, learnerHeaders)).status).toBe(403);
    await prisma.membership.deleteMany({ where: { organizationId, userId: learnerId, role: 'manager' } });
    await post('/auth/qr/approve', { code: next.code }, learnerHeaders);
    await status(next.pollToken);
    const session = await prisma.session.findFirstOrThrow({ where: { userId: learnerId, viaQr: true }, orderBy: { createdAt: 'desc' } });
    expect((session.maxExpiresAt!.getTime() - Date.now()) / 3_600_000).toBeLessThanOrEqual(2);
  });

  it('never extends a session got by QR past its term, and slows down a device that asks too often', async () => {
    const request = await start();
    await post('/auth/qr/approve', { code: request.code }, learnerHeaders);
    const opened = await status(request.pollToken);
    const session = await prisma.session.findFirstOrThrow({ where: { userId: learnerId, viaQr: true }, orderBy: { createdAt: 'desc' } });
    const { AuthService } = await import('../modules/auth/auth.service.js');
    const service = app.get(AuthService);
    await service.refreshSession(session.id, learnerId, organizationId);
    const refreshed = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(refreshed.refreshExpiresAt!.getTime()).toBeLessThanOrEqual(session.maxExpiresAt!.getTime());
    expect(opened.accessToken).toBeTruthy();

    const answers: number[] = [];
    for (let index = 0; index < 12; index += 1) answers.push((await post('/auth/qr/start', {})).status);
    expect(answers).toContain(429);
  });
});
