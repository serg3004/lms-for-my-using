/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// Removing a built-in role through the real HTTP stack and Postgres: DELETE /memberships/:id.
const PASSWORD = 'Revoke1!Revoke';

describe('removing a built-in role — database', () => {
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

  const remove = (headers: Record<string, string>, membershipId: string) => fetch(`${baseUrl}/api/v1/memberships/${membershipId}`, { method: 'DELETE', headers });

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
    organizationId = (await prisma.organization.create({ data: { name: `Revoke ${runId}`, slug: `revoke-${runId}` } })).id;
    otherOrganizationId = (await prisma.organization.create({ data: { name: `Revoke other ${runId}`, slug: `revoke-other-${runId}` } })).id;
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

  it('lets only an administrator remove a role, keeps the last and the own administrator role, and records the removal', async () => {
    const admin = await createUser('admin', 'admin');
    const secondAdmin = await createUser('admin2', 'admin');
    const manager = await createUser('manager', 'manager');
    const learner = await createUser('learner', 'learner');
    const adminHeaders = await headersFor(admin);

    // A manager (who may read memberships) and a learner cannot remove anything.
    expect((await remove(await headersFor(manager), learner.membershipId)).status).toBe(403);
    expect((await remove(await headersFor(learner), manager.membershipId)).status).toBe(403);
    expect(await prisma.membership.count({ where: { id: { in: [learner.membershipId, manager.membershipId] } } })).toBe(2);

    // The administrator removes the manager role; it is gone and written to the audit log.
    expect((await remove(adminHeaders, manager.membershipId)).status).toBe(204);
    expect(await prisma.membership.count({ where: { id: manager.membershipId } })).toBe(0);
    const entry = await prisma.auditLog.findFirst({ where: { organizationId, action: 'membership.revoked', targetId: manager.userId } });
    expect(entry?.actorId).toBe(admin.userId);

    // An unknown id and a role of another organization answer 404.
    expect((await remove(adminHeaders, randomUUID())).status).toBe(404);
    const foreign = await createUser('foreign', 'learner', otherOrganizationId);
    expect((await remove(adminHeaders, foreign.membershipId)).status).toBe(404);
    expect(await prisma.membership.count({ where: { id: foreign.membershipId } })).toBe(1);

    // The own administrator role stays; another administrator's can go while one remains, then the last one is kept.
    expect((await remove(adminHeaders, admin.membershipId)).status).toBe(409);
    expect((await remove(adminHeaders, secondAdmin.membershipId)).status).toBe(204);
    const lastHeaders = await headersFor(admin);
    expect((await remove(lastHeaders, admin.membershipId)).status).toBe(409);
    expect(await prisma.membership.count({ where: { organizationId, role: 'admin' } })).toBe(1);
  });
});
