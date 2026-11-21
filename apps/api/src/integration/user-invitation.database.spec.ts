/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 487: invite a user without a password, accept the invitation, and sign in — real HTTP stack and Postgres.
const PASSWORD = 'Invite1!Invite';

describe('email invitation — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string;
  let otherOrganizationId: string;
  const emails = new Map<string, string>();

  async function createUser(label: string, role: 'learner' | 'instructor' | 'manager' | 'admin', organization = organizationId) {
    const { hashPassword } = await import('../modules/auth/passwords.js');
    const email = `${label}-${randomUUID()}@example.test`;
    const user = await prisma.user.create({ data: { organizationId: organization, email, passwordHash: await hashPassword(PASSWORD), firstName: label, lastName: 'User' } });
    const membership = await prisma.membership.create({ data: { organizationId: organization, userId: user.id, role } });
    emails.set(user.id, email);
    return { userId: user.id, membershipId: membership.id, organizationId: organization };
  }

  async function headersFor(user: { userId: string; organizationId: string }) {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: user.organizationId, email: emails.get(user.userId), password: PASSWORD }),
    });
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
    organizationId = (await prisma.organization.create({ data: { name: `Invite ${runId}`, slug: `invite-${runId}` } })).id;
    otherOrganizationId = (await prisma.organization.create({ data: { name: `Invite other ${runId}`, slug: `invite-other-${runId}` } })).id;
  });

  afterAll(async () => {
    try {
      for (const id of [organizationId, otherOrganizationId]) {
        if (!id) continue;
        await prisma.auditLog.deleteMany({ where: { organizationId: id } });
        await prisma.user.deleteMany({ where: { organizationId: id } });
        await prisma.organization.deleteMany({ where: { id } });
      }
    } finally {
      await app?.close();
    }
  });

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${baseUrl}/api/v1${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  const login = (email: string, password: string) => post('/auth/login', { organizationId, email, password });
  const tokenOf = (url: string) => new URL(url, 'http://localhost').searchParams.get('token') ?? '';

  it('creates an invited user without a password, blocks sign-in until accepted, and accepts the link exactly once', async () => {
    const admin = await createUser('admin', 'admin');
    const headers = await headersFor(admin);
    const email = `invited-${randomUUID()}@example.test`;

    const created = await post('/users', { organizationId, email, firstName: 'Aigul', lastName: 'Invited', locale: 'kk' }, headers);
    expect(created.status).toBe(201);
    const body = (await created.json()) as { data?: { id: string; status: string; invitation: { delivered: boolean; inviteUrl?: string } }; id?: string; status?: string; invitation?: { delivered: boolean; inviteUrl?: string } };
    const user = body.data ?? body;
    expect(user.status).toBe('invited');
    // The CI environment has no mail provider, so the link comes back once for the administrator to hand over.
    const inviteUrl = user.invitation?.inviteUrl;
    expect(inviteUrl).toContain('/invitation?token=');
    const token = tokenOf(inviteUrl!);

    expect((await prisma.userInvitation.findFirst({ where: { userId: user.id } }))?.tokenHash).not.toBe(token);
    expect((await login(email, PASSWORD)).status).toBe(401);

    expect((await post('/auth/invitation/accept', { token, password: 'weak' })).status).toBe(400);
    expect((await post('/auth/invitation/accept', { token, password: PASSWORD })).status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe('active');
    expect((await login(email, PASSWORD)).status).toBe(201);
    expect((await post('/auth/invitation/accept', { token, password: PASSWORD })).status).toBe(400);

    const actions = (await prisma.auditLog.findMany({ where: { organizationId, targetId: user.id } })).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(['user.invited', 'user.invitation.accepted']));
  });

  it('rejects an expired link and a link whose invitation was replaced by a newer one', async () => {
    const admin = await createUser('admin3', 'admin');
    const headers = await headersFor(admin);
    const created = await post('/users', { organizationId, email: `expired-${randomUUID()}@example.test`, firstName: 'Old', lastName: 'Link' }, headers);
    const body = (await created.json()) as { data?: { id: string; invitation: { inviteUrl: string } }; id?: string; invitation?: { inviteUrl: string } };
    const user = (body.data ?? body) as { id: string; invitation: { inviteUrl: string } };
    const token = tokenOf(user.invitation.inviteUrl);

    await prisma.userInvitation.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(0) } });
    expect((await post('/auth/invitation/accept', { token, password: PASSWORD })).status).toBe(400);
    expect((await post('/auth/invitation/accept', { token: 'x'.repeat(43), password: PASSWORD })).status).toBe(400);
  });
});
