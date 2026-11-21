/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 488: the organization's password policy and a user changing their own password — real HTTP stack and Postgres.
const PASSWORD = 'Policy1!Policy';

describe('password policy — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string;
  const emails = new Map<string, string>();

  async function createUser(label: string, role: 'learner' | 'admin') {
    const { hashPassword } = await import('../modules/auth/passwords.js');
    const email = `${label}-${randomUUID()}@example.test`;
    const user = await prisma.user.create({ data: { organizationId, email, passwordHash: await hashPassword(PASSWORD), firstName: label, lastName: 'User' } });
    await prisma.membership.create({ data: { organizationId, userId: user.id, role } });
    emails.set(user.id, email);
    return { userId: user.id, email };
  }

  async function signIn(email: string, password: string) {
    return fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId, email, password }),
    });
  }

  async function headersFor(email: string, password = PASSWORD) {
    const response = await signIn(email, password);
    const body = (await response.json()) as { accessToken?: string; data?: { accessToken: string } };
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
    organizationId = (await prisma.organization.create({ data: { name: `Policy ${runId}`, slug: `policy-${runId}` } })).id;
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

  const send = (method: string, path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${baseUrl}/api/v1${path}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });

  it('lets an administrator read and change the policy, and refuses values outside 5–20', async () => {
    const admin = await createUser('admin', 'admin');
    const headers = await headersFor(admin.email);
    const path = `/organizations/${organizationId}/password-policy`;

    const current = await fetch(`${baseUrl}/api/v1${path}`, { headers });
    expect(current.status).toBe(200);
    expect(await current.json()).toMatchObject({ minLength: 10, historyCount: 3 });

    expect((await send('PATCH', path, { minLength: 4, historyCount: 3 }, headers)).status).toBe(400);
    expect((await send('PATCH', path, { minLength: 21, historyCount: 3 }, headers)).status).toBe(400);
    expect((await send('PATCH', path, { minLength: 12, historyCount: 3 }, headers)).status).toBe(200);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } })).passwordMinLength).toBe(12);
    expect((await prisma.auditLog.count({ where: { organizationId, action: 'organization.password_policy_updated' } }))).toBe(1);

    await send('PATCH', path, { minLength: 10, historyCount: 3 }, headers);
  });

  it('changes the own password, ends the other sessions, keeps the current one and refuses a repeat', async () => {
    const user = await createUser('learner', 'learner');
    const first = await headersFor(user.email);
    const second = await headersFor(user.email);
    const newPassword = 'Another2Tulip';

    expect((await send('POST', '/auth/change-password', { currentPassword: 'wrong-Password1', newPassword }, first)).status).toBe(401);
    expect((await send('POST', '/auth/change-password', { currentPassword: PASSWORD, newPassword: 'short1' }, first)).status).toBe(400);
    expect((await send('POST', '/auth/change-password', { currentPassword: PASSWORD, newPassword: PASSWORD }, first)).status).toBe(400);
    expect((await send('POST', '/auth/change-password', { currentPassword: PASSWORD, newPassword }, first)).status).toBe(201);

    expect((await fetch(`${baseUrl}/api/v1/auth/me`, { headers: first })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/v1/auth/me`, { headers: second })).status).toBe(401);
    expect((await signIn(user.email, PASSWORD)).status).toBe(401);
    expect((await signIn(user.email, newPassword)).status).toBe(201);

    // The replaced password may not come back while it is within the remembered history.
    expect((await send('POST', '/auth/change-password', { currentPassword: newPassword, newPassword: PASSWORD }, first)).status).toBe(400);
    expect((await prisma.auditLog.count({ where: { organizationId, action: 'user.password_changed', targetId: user.userId } }))).toBe(1);
  });
});
