/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 506: the QR badge of an employee — real HTTP stack and Postgres. A scan opens a kiosk session for assigned work only.
const PASSWORD = 'Invite1!Invite';

describe('QR badge of an employee — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string;
  let adminId: string;
  let adminHeaders: Record<string, string>;
  let learnerId: string;
  let learnerEmail: string;
  let learnerHeaders: Record<string, string>;
  let managerId: string;
  let managerHeaders: Record<string, string>;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'database-smoke-jwt-secret-32-characters';
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../app.module.js');
    const { PrismaService: Prisma } = await import('../database/prisma.service.js');
    const { ApiExceptionFilter } = await import('../common/filters/api-exception.filter.js');
    const { hashPassword } = await import('../modules/auth/passwords.js');
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const express = testingModule.createNestApplication<NestExpressApplication>({ bodyParser: false });
    express.useBodyParser('json');
    app = express;
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    prisma = app.get(Prisma);
    const runId = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `Badge ${runId}`, slug: `badge-${runId}` } })).id;
    const person = async (label: string, role: 'admin' | 'manager' | 'learner') => {
      const email = `${label}-${runId}@example.test`;
      const user = await prisma.user.create({ data: { organizationId, email, passwordHash: await hashPassword(PASSWORD), firstName: label, lastName: 'Тест' } });
      await prisma.membership.create({ data: { organizationId, userId: user.id, role } });
      return { id: user.id, email };
    };
    const admin = await person('admin', 'admin');
    const manager = await person('manager', 'manager');
    const learner = await person('learner', 'learner');
    adminId = admin.id;
    managerId = manager.id;
    learnerId = learner.id;
    learnerEmail = learner.email;
    adminHeaders = await signIn(admin.email);
    managerHeaders = await signIn(manager.email);
    learnerHeaders = await signIn(learner.email);
  });

  afterAll(async () => {
    try {
      if (organizationId) {
        await prisma.notification.deleteMany({ where: { organizationId } });
        await prisma.auditLog.deleteMany({ where: { organizationId } });
        await prisma.user.deleteMany({ where: { organizationId } });
        await prisma.organization.deleteMany({ where: { id: organizationId } });
      }
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
  const call = (method: string, path: string, headers: Record<string, string> = {}, body?: unknown) => fetch(`${baseUrl}/api/v1${path}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  type Issued = { userId: string; token: string; pin: string };
  const issue = async (userIds: string[], headers = adminHeaders) => unwrap<{ items: Issued[]; skipped: number }>(await call('POST', '/users/badges', headers, { userIds }));
  const scan = (token: string, pin?: string) => call('POST', '/auth/badge/login', {}, pin === undefined ? { token } : { token, pin });
  async function kioskHeaders(userId = learnerId) {
    const { items } = await issue([userId]);
    const response = await scan(items[0]!.token, items[0]!.pin);
    expect(response.status).toBe(201);
    const body = await unwrap<{ status: string; accessToken: string }>(response);
    return { headers: { authorization: `Bearer ${body.accessToken}` }, issued: items[0]! };
  }
  const setPolicy = (policy: Record<string, unknown>) => call('PATCH', `/organizations/${organizationId}/badge`, adminHeaders, policy);

  it('lets an administrator or a manager issue badges, shows the token once and stores only hashes', async () => {
    expect((await call('POST', '/users/badges', learnerHeaders, { userIds: [learnerId] })).status).toBe(403);
    expect((await call('POST', '/users/badges', {}, { userIds: [learnerId] })).status).toBe(401);

    // A manager may issue badges, but only inside the team they manage; this one has no team yet.
    expect(await issue([learnerId], managerHeaders)).toEqual({ items: [], skipped: 1 });
    const result = await issue([learnerId, adminId, managerId, randomUUID()]);
    // A badge is for ordinary roles; an administrator, a manager and an unknown person are skipped.
    expect(result.items).toHaveLength(1);
    expect(result.skipped).toBe(3);
    const { token, pin } = result.items[0]!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pin).toMatch(/^\d{4}$/);
    const row = await prisma.userBadge.findFirstOrThrow({ where: { userId: learnerId, state: 'active' } });
    expect(row.tokenHash).not.toContain(token);
    expect(row.pinHash).not.toContain(pin);
    const audit = JSON.stringify(await prisma.auditLog.findMany({ where: { organizationId } }));
    expect(audit).not.toContain(token);
    expect(audit).not.toContain(row.tokenHash);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'user.badge_issued', targetId: learnerId } })).toBe(1);
  });

  it('asks for the PIN, answers every wrong thing the same way, and opens a kiosk session on the right PIN', async () => {
    const { items } = await issue([learnerId]);
    const { token, pin } = items[0]!;

    // A token nobody knows looks like a real one that wants a PIN.
    expect(await unwrap(await scan(randomUUID().replaceAll('-', '').padEnd(43, 'a').slice(0, 43)))).toEqual({ status: 'pinRequired' });
    expect(await unwrap(await scan(token))).toEqual({ status: 'pinRequired' });

    const wrong = await scan(token, pin === '0000' ? '1111' : '0000');
    expect(wrong.status).toBe(401);
    const unknown = await scan('A'.repeat(43), pin);
    expect(unknown.status).toBe(401);
    const same = async (response: Response) => {
      const body = (await response.json()) as Record<string, unknown>;
      delete body.timestamp;
      return JSON.stringify(body);
    };
    expect(await same(wrong)).toBe(await same(unknown));

    const ok = await scan(token, pin);
    expect(ok.status).toBe(201);
    const body = await unwrap<{ status: string; accessToken: string; user: { kiosk?: boolean; email: string } }>(ok);
    expect(body.status).toBe('ok');
    expect(body.user.kiosk).toBe(true);
    const session = await prisma.session.findFirstOrThrow({ where: { userId: learnerId, viaBadge: true, revokedAt: null }, orderBy: { createdAt: 'desc' } });
    expect(session.maxExpiresAt && session.refreshExpiresAt && session.refreshExpiresAt <= session.maxExpiresAt).toBe(true);
    expect(session.refreshExpiresAt!.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000);
    expect(await prisma.loginEvent.count({ where: { userId: learnerId, outcome: 'badge' } })).toBeGreaterThanOrEqual(1);
    expect(await prisma.loginEvent.count({ where: { userId: learnerId, outcome: 'failed' } })).toBeGreaterThanOrEqual(1);
  });

  it('keeps a kiosk session to assigned work: the rest of the API and the account are closed', async () => {
    const { headers } = await kioskHeaders();
    const me = await unwrap<{ kiosk?: boolean }>(await call('GET', '/auth/me', headers));
    expect(me.kiosk).toBe(true);
    expect((await call('GET', '/learner-dashboard', headers)).status).toBe(200);
    expect((await call('GET', '/assignments', headers)).status).toBe(200);
    expect((await call('GET', '/checklist-instances/mine', headers)).status).toBe(200);

    for (const [method, path] of [
      ['GET', '/users'], ['GET', '/certificates'], ['GET', '/memberships'], ['GET', '/checklists/analytics'], ['GET', '/checklist-sessions'],
      ['GET', '/notifications'], ['GET', '/audit-log'], ['GET', '/checklists/free'], ['POST', `/checklists/${randomUUID()}/start`], ['GET', `/organizations/${organizationId}/badge`],
      ['POST', '/users/badges'],
    ] as const) {
      const response = await call(method, path, headers, method === 'POST' ? {} : undefined);
      expect([method, path, response.status]).toEqual([method, path, 403]);
      expect(JSON.stringify(await response.json())).toContain('KIOSK_SESSION_RESTRICTED');
    }
    // Account functions: sessions, password, QR approvals, the badge itself.
    for (const [method, path, body] of [
      ['GET', '/auth/me/sessions', undefined], ['POST', '/auth/change-password', { currentPassword: PASSWORD, newPassword: 'Other1!Other1' }],
      ['POST', '/auth/qr/approve', { code: 'A'.repeat(43) }], ['POST', '/auth/me/badge/lost', undefined], ['PUT', '/auth/me/badge/pin', { pin: '1234' }],
    ] as const) {
      const response = await call(method, path, headers, body);
      expect([method, path, response.status]).toEqual([method, path, 403]);
    }
  });

  it('locks a badge after wrong PINs and an administrator unlocks it with a new PIN', async () => {
    const { items } = await issue([learnerId]);
    const { token, pin } = items[0]!;
    const wrongPin = pin === '0000' ? '1111' : '0000';
    for (let attempt = 0; attempt < 5; attempt += 1) expect((await scan(token, wrongPin)).status).toBe(401);
    expect((await prisma.userBadge.findFirstOrThrow({ where: { userId: learnerId, state: 'active' } })).pinLockedUntil).not.toBeNull();
    // The right PIN does not help while the badge is locked, and the answer does not say so.
    expect((await scan(token, pin)).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'user.badge_locked', targetId: learnerId } })).toBeGreaterThanOrEqual(1);

    expect((await call('POST', `/users/${learnerId}/badge/pin-reset`, learnerHeaders)).status).toBe(403);
    const reset = await unwrap<{ pin: string }>(await call('POST', `/users/${learnerId}/badge/pin-reset`, adminHeaders));
    expect(reset.pin).toMatch(/^\d{4}$/);
    expect((await scan(token, reset.pin)).status).toBe(201);
    if (reset.pin !== pin) expect((await scan(token, pin)).status).toBe(401);
  });

  it('lets the employee choose their own PIN, then report the badge lost: it stops at once and administrators are told', async () => {
    const { items } = await issue([learnerId]);
    const { token } = items[0]!;
    const mine = await unwrap<{ badge: { issuedAt: string } | null; pinRequired: boolean }>(await call('GET', '/auth/me/badge', learnerHeaders));
    expect(mine.badge).not.toBeNull();
    expect(mine.pinRequired).toBe(true);
    expect(JSON.stringify(mine)).not.toContain(token);

    expect((await call('PUT', '/auth/me/badge/pin', learnerHeaders, { pin: '12' })).status).toBe(400);
    expect((await call('PUT', '/auth/me/badge/pin', learnerHeaders, { pin: '482915' })).status).toBe(200);
    const kiosk = await scan(token, '482915');
    expect(kiosk.status).toBe(201);
    const kioskToken = (await unwrap<{ accessToken: string }>(kiosk)).accessToken;

    expect((await call('POST', '/auth/me/badge/lost', learnerHeaders)).status).toBe(201);
    expect((await scan(token, '482915')).status).toBe(401);
    // The kiosk session of the lost badge ends with it.
    expect((await call('GET', '/learner-dashboard', { authorization: `Bearer ${kioskToken}` })).status).toBe(401);
    expect((await prisma.userBadge.findFirstOrThrow({ where: { userId: learnerId }, orderBy: { issuedAt: 'desc' } })).state).toBe('lost');
    expect(await prisma.notification.count({ where: { organizationId, userId: adminId, type: 'badge_lost' } })).toBe(1);
    expect((await call('POST', '/auth/me/badge/lost', learnerHeaders)).status).toBe(404);
  });

  it('revokes the old badge when a new one is issued, and an administrator can revoke one', async () => {
    const first = (await issue([learnerId])).items[0]!;
    const second = (await issue([learnerId])).items[0]!;
    expect((await scan(first.token, first.pin)).status).toBe(401);
    expect((await scan(second.token, second.pin)).status).toBe(201);
    expect(await prisma.userBadge.count({ where: { userId: learnerId, state: 'active' } })).toBe(1);

    const state = await unwrap<{ badge: { state: string } | null }>(await call('GET', `/users/${learnerId}/badge`, adminHeaders));
    expect(state.badge?.state).toBe('active');
    expect((await call('DELETE', `/users/${learnerId}/badge`, learnerHeaders)).status).toBe(403);
    expect((await call('DELETE', `/users/${learnerId}/badge`, adminHeaders)).status).toBe(200);
    expect((await scan(second.token, second.pin)).status).toBe(401);
    expect((await call('GET', `/users/${randomUUID()}/badge`, adminHeaders)).status).toBe(404);
  });

  it('turns the PIN off and on, bounds the idle time, and refuses a person who now needs the password', async () => {
    expect((await call('PATCH', `/organizations/${organizationId}/badge`, learnerHeaders, { pinRequired: false, idleMinutes: 30 })).status).toBe(403);
    expect((await setPolicy({ pinRequired: false, idleMinutes: 14 })).status).toBe(400);
    expect((await setPolicy({ pinRequired: false, idleMinutes: 121 })).status).toBe(400);
    const { items } = await issue([learnerId]);
    const { token } = items[0]!;
    expect((await setPolicy({ pinRequired: false, idleMinutes: 20 })).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'organization.badge_policy_updated' } })).toBe(1);
    // Without a PIN requirement the badge alone opens the kiosk session.
    const alone = await scan(token);
    expect(alone.status).toBe(201);
    const session = await prisma.session.findFirstOrThrow({ where: { userId: learnerId, viaBadge: true, revokedAt: null }, orderBy: { createdAt: 'desc' } });
    expect(session.refreshExpiresAt!.getTime() - Date.now()).toBeLessThanOrEqual(20 * 60_000);

    expect((await setPolicy({ pinRequired: true, idleMinutes: 30 })).status).toBe(200);
    expect(await unwrap(await scan(token))).toEqual({ status: 'pinRequired' });

    // A person who gets a temporary password, or an extra role, can no longer use the badge.
    await prisma.user.update({ where: { id: learnerId }, data: { mustChangePassword: true } });
    expect((await scan(token, items[0]!.pin)).status).toBe(401);
    await prisma.user.update({ where: { id: learnerId }, data: { mustChangePassword: false } });
    await prisma.membership.create({ data: { organizationId, userId: learnerId, role: 'manager' } });
    expect((await scan(token, items[0]!.pin)).status).toBe(401);
    await prisma.membership.deleteMany({ where: { organizationId, userId: learnerId, role: 'manager' } });
    expect((await scan(token, items[0]!.pin)).status).toBe(201);
    expect(learnerEmail).toContain('learner');
  });
});
