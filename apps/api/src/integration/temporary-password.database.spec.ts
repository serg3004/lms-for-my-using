/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 489: temporary password — issue, sign in once, API closed until the change, then a normal session.
const PASSWORD = 'Temp1!Temp1Pass';

describe('temporary password — database', () => {
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
  const signIn = (email: string, password: string) => send('POST', '/auth/login', { organizationId, email, password });
  async function headersFor(email: string, password: string) {
    const body = (await (await signIn(email, password)).json()) as { accessToken?: string; data?: { accessToken: string } };
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
    organizationId = (await prisma.organization.create({ data: { name: `Temp ${runId}`, slug: `temp-${runId}` } })).id;
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

  it('issues a temporary password once, closes the API until the user sets their own, and works for one sign-in only', async () => {
    const admin = await createUser('admin', 'admin');
    const worker = await createUser('worker', 'learner');
    const adminHeaders = await headersFor(admin.email, PASSWORD);
    const oldSession = await headersFor(worker.email, PASSWORD);

    const issuedResponse = await send('POST', `/users/${worker.id}/temporary-password`, undefined, adminHeaders);
    expect(issuedResponse.status).toBe(201);
    const issued = (await issuedResponse.json()) as { temporaryPassword: string; expiresAt: string };
    expect(issued.temporaryPassword).toHaveLength(12);

    // The old session is ended and the old password no longer works.
    expect((await send('GET', '/auth/me', undefined, oldSession)).status).toBe(401);
    expect((await signIn(worker.email, PASSWORD)).status).toBe(401);

    // The audit log never carries the password.
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { organizationId, action: 'user.temporary_password_issued', targetId: worker.id } });
    expect(JSON.stringify(audit)).not.toContain(issued.temporaryPassword);

    const login = await signIn(worker.email, issued.temporaryPassword);
    expect(login.status).toBe(201);
    const loginBody = (await login.json()) as { accessToken?: string; data?: { accessToken: string; user: { mustChangePassword: boolean } }; user?: { mustChangePassword: boolean } };
    expect((loginBody.user ?? loginBody.data?.user)?.mustChangePassword).toBe(true);
    const session = { authorization: `Bearer ${loginBody.accessToken ?? loginBody.data?.accessToken}` };

    // Everything except the user's own data and the change is closed; a second sign-in with the same temporary password is refused.
    expect((await send('GET', '/auth/me', undefined, session)).status).toBe(200);
    const closed = await send('GET', '/courses', undefined, session);
    expect(closed.status).toBe(403);
    expect(JSON.stringify(await closed.json())).toContain('PASSWORD_CHANGE_REQUIRED');
    expect((await signIn(worker.email, issued.temporaryPassword)).status).toBe(401);

    const ownPassword = 'Chosen9Garden7';
    expect((await send('POST', '/auth/change-password', { currentPassword: issued.temporaryPassword, newPassword: issued.temporaryPassword }, session)).status).toBe(400);
    expect((await send('POST', '/auth/change-password', { currentPassword: issued.temporaryPassword, newPassword: ownPassword }, session)).status).toBe(201);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: worker.id } });
    expect(after).toMatchObject({ mustChangePassword: false, temporaryPasswordExpiresAt: null, temporaryPasswordUsedAt: null });
    expect((await send('GET', '/courses', undefined, session)).status).not.toBe(403);
  });

  it('refuses an expired temporary password and creates a user with one', async () => {
    const admin = await createUser('admin2', 'admin');
    const adminHeaders = await headersFor(admin.email, PASSWORD);
    const created = await send('POST', '/users', { organizationId, email: `fresh-${randomUUID()}@example.test`, firstName: 'Fresh', lastName: 'Hire', temporaryPassword: true }, adminHeaders);
    expect(created.status).toBe(201);
    const body = (await created.json()) as { data?: Record<string, unknown>; id?: string; email?: string; status?: string; temporaryPassword?: { temporaryPassword: string } };
    const user = (body.data ?? body) as { id: string; email: string; status: string; temporaryPassword: { temporaryPassword: string } };
    expect(user.status).toBe('active');

    await prisma.user.update({ where: { id: user.id }, data: { temporaryPasswordExpiresAt: new Date(0) } });
    expect((await signIn(user.email, user.temporaryPassword.temporaryPassword)).status).toBe(401);
  });
});
