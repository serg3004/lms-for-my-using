/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication, LoggerService } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 498: one person goes through the whole life of an account (invite, accept, sign in, change the password, get locked,
// be unlocked, archive, restore) over the real HTTP stack and Postgres. Along the way no password, invitation token or
// hash may appear in an API answer, in the audit log or in the application log.
const FIRST = 'Zeta1!Alpha-One';
const SECOND = 'Zeta2!Beta-Two';
const ADMIN_PASSWORD = 'Zeta3!Gamma-Three';

type Json = Record<string, unknown>;

describe('account life cycle — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string;
  const logLines: string[] = [];
  const answers: string[] = [];

  const capture: LoggerService = {
    log: (...args: unknown[]) => { logLines.push(args.map(String).join(' ')); },
    error: (...args: unknown[]) => { logLines.push(args.map(String).join(' ')); },
    warn: (...args: unknown[]) => { logLines.push(args.map(String).join(' ')); },
    debug: (...args: unknown[]) => { logLines.push(args.map(String).join(' ')); },
    verbose: (...args: unknown[]) => { logLines.push(args.map(String).join(' ')); },
  };

  async function send(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    answers.push(text);
    return { status: response.status, body: text ? (JSON.parse(text) as Json) : {} };
  }
  const data = (body: Json) => (body.data ?? body) as Json;
  const signIn = (email: string, password: string) => send('POST', '/auth/login', { organizationId, email, password });
  const bearer = async (email: string, password: string) => ({ authorization: `Bearer ${data((await signIn(email, password)).body).accessToken}` });

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
    app.useLogger(capture);
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    prisma = app.get(Prisma);
    const runId = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `Life ${runId}`, slug: `life-${runId}`, loginMaxFailures: 3, loginLockMinutes: 15 } })).id;
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

  it('carries one account from the invitation to the archive and back, and leaks no secret on the way', async () => {
    const { hashPassword } = await import('../modules/auth/passwords.js');
    const adminEmail = `admin-${randomUUID()}@example.test`;
    const admin = await prisma.user.create({ data: { organizationId, email: adminEmail, passwordHash: await hashPassword(ADMIN_PASSWORD), firstName: 'Admin', lastName: 'Life' } });
    await prisma.membership.create({ data: { organizationId, userId: admin.id, role: 'admin' } });
    const adminHeaders = await bearer(adminEmail, ADMIN_PASSWORD);

    // 1. Invite without a password; nobody can sign in yet.
    const email = `life-${randomUUID()}@example.test`;
    const created = await send('POST', '/users', { organizationId, email, firstName: 'Aigul', lastName: 'Life', locale: 'kk' }, adminHeaders);
    expect(created.status).toBe(201);
    const user = data(created.body);
    expect(user.status).toBe('invited');
    const inviteUrl = String((user.invitation as Json | undefined)?.inviteUrl ?? '');
    expect(inviteUrl).toContain('/invitation?token=');
    const token = new URL(inviteUrl, 'http://localhost').searchParams.get('token') ?? '';
    expect((await signIn(email, FIRST)).status).toBe(401);

    // 2. Accept (a weak password is refused), then sign in.
    expect((await send('POST', '/auth/invitation/accept', { token, password: 'weak' })).status).toBe(400);
    expect((await send('POST', '/auth/invitation/accept', { token, password: FIRST })).status).toBe(201);
    const first = await signIn(email, FIRST);
    expect(first.status).toBe(201);
    const headers = { authorization: `Bearer ${data(first.body).accessToken}` };

    // 3. Change the password: the old one stops working, the new one works.
    expect((await send('POST', '/auth/change-password', { currentPassword: 'Wrong1!Wrong1', newPassword: SECOND }, headers)).status).toBe(401);
    expect((await send('POST', '/auth/change-password', { currentPassword: FIRST, newPassword: SECOND }, headers)).status).toBe(201);
    expect((await signIn(email, FIRST)).status).toBe(401);
    expect((await signIn(email, SECOND)).status).toBe(201);

    // 4. A series of wrong passwords locks the account; the right one is refused until an administrator unlocks it.
    for (const wrong of ['Wrong1!Wrong1', 'Wrong2!Wrong2', 'Wrong3!Wrong3']) await signIn(email, wrong);
    expect((await signIn(email, SECOND)).status).toBe(401);
    expect((await send('POST', `/users/${user.id}/unlock`, undefined, adminHeaders)).status).toBe(201);
    expect((await signIn(email, SECOND)).status).toBe(201);

    // 5. Archive (the sessions end), then restore.
    expect((await send('PATCH', `/users/${user.id}/status`, { status: 'archived', confirm: true }, adminHeaders)).status).toBe(200);
    expect((await signIn(email, SECOND)).status).toBe(401);
    expect((await send('PATCH', `/users/${user.id}/status`, { status: 'active' }, adminHeaders)).status).toBe(200);
    expect((await signIn(email, SECOND)).status).toBe(201);

    // The audit trail shows each step by name.
    const actions = (await prisma.auditLog.findMany({ where: { organizationId, targetId: user.id } })).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(['user.invited', 'user.invitation.accepted', 'user.login_locked', 'user.login_unlocked', 'user.archived', 'user.restored']));

    // No secret anywhere: not in the audit log, not in the log, not in any API answer; hashes never leave the server.
    const audit = JSON.stringify(await prisma.auditLog.findMany({ where: { organizationId } }));
    const stored = await prisma.userInvitation.findFirstOrThrow({ where: { userId: user.id } });
    const passwordHash = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash;
    const secrets = [FIRST, SECOND, ADMIN_PASSWORD, 'Wrong1!Wrong1', 'Wrong2!Wrong2', 'Wrong3!Wrong3', token];
    for (const secret of secrets) {
      expect(audit).not.toContain(secret);
      expect(logLines.join('\n')).not.toContain(secret);
    }
    // The invitation link is handed over once, in the answer that created it (no mail provider in CI); never again.
    for (const text of answers.filter((entry) => !entry.includes('"inviteUrl"'))) {
      for (const secret of [...secrets, stored.tokenHash, passwordHash ?? '']) expect(text).not.toContain(secret);
    }
    for (const text of answers) {
      expect(text).not.toContain(stored.tokenHash);
      if (passwordHash) expect(text).not.toContain(passwordHash);
      expect(text).not.toMatch(/"(password|passwordHash|tokenHash)"\s*:/);
    }
  });
});
