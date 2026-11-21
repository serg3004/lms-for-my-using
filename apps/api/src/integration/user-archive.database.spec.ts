/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 495: an archived user cannot sign in, stays in the history, and signs in again after restoring.
const PASSWORD = 'Arch1!Arch1Pass';

describe('user archive and restore — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string;

  async function createUser(label: string, role: 'learner' | 'admin' | 'manager') {
    const { hashPassword } = await import('../modules/auth/passwords.js');
    const email = `${label}-${randomUUID()}@example.test`;
    const user = await prisma.user.create({ data: { organizationId, email, passwordHash: await hashPassword(PASSWORD), firstName: label, lastName: 'Person' } });
    await prisma.membership.create({ data: { organizationId, userId: user.id, role } });
    return { id: user.id, email };
  }

  const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => fetch(`${baseUrl}/api/v1${path}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const signIn = (email: string) => send('POST', '/auth/login', { organizationId, email, password: PASSWORD });
  async function headersFor(email: string) {
    const body = (await (await signIn(email)).json()) as { accessToken?: string; data?: { accessToken: string } };
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
    organizationId = (await prisma.organization.create({ data: { name: `Archive ${runId}`, slug: `archive-${runId}` } })).id;
  });

  afterAll(async () => {
    try {
      if (organizationId) {
        await prisma.auditLog.deleteMany({ where: { organizationId } });
        await prisma.managerGroup.deleteMany({ where: { organizationId } });
        await prisma.groupMember.deleteMany({ where: { organizationId } });
        await prisma.group.deleteMany({ where: { organizationId } });
        await prisma.assignment.deleteMany({ where: { organizationId } });
        await prisma.course.deleteMany({ where: { organizationId } });
        await prisma.user.deleteMany({ where: { organizationId } });
        await prisma.organization.deleteMany({ where: { id: organizationId } });
      }
    } finally {
      await app?.close();
    }
  });

  it('needs confirmation, then closes sign-in and keeps assignments; restoring brings access back', async () => {
    const admin = await createUser('admin', 'admin');
    const worker = await createUser('worker', 'learner');
    const course = await prisma.course.create({ data: { organizationId, title: 'Safety', slug: `safety-${randomUUID()}` } });
    await prisma.assignment.create({ data: { organizationId, courseId: course.id, userId: worker.id } });
    const adminHeaders = await headersFor(admin.email);
    const workerHeaders = await headersFor(worker.email);

    expect((await send('GET', `/users/${worker.id}/status-impact`, undefined, adminHeaders)).status).toBe(200);
    const impact = (await (await send('GET', `/users/${worker.id}/status-impact`, undefined, adminHeaders)).json()) as { openAssignments?: number; data?: { openAssignments: number } };
    expect(impact.openAssignments ?? impact.data?.openAssignments).toBe(1);
    expect((await send('PATCH', `/users/${worker.id}/status`, { status: 'archived' }, adminHeaders)).status).toBe(409);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: worker.id } })).status).toBe('active');

    expect((await send('PATCH', `/users/${worker.id}/status`, { status: 'archived', confirm: true }, adminHeaders)).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: worker.id } })).status).toBe('archived');
    expect((await signIn(worker.email)).status).toBe(401);
    expect((await send('GET', '/auth/me/sessions', undefined, workerHeaders)).status).toBe(401);
    expect(await prisma.assignment.count({ where: { organizationId, userId: worker.id } })).toBe(1);

    const archived = await send('GET', '/users?status=archived&pageSize=50', undefined, adminHeaders);
    expect(JSON.stringify(await archived.json())).toContain(worker.email);
    expect((await send('PATCH', `/users/${worker.id}/status`, { status: 'suspended' }, adminHeaders)).status).toBe(409);

    expect((await send('PATCH', `/users/${worker.id}/status`, { status: 'active' }, adminHeaders)).status).toBe(200);
    expect((await signIn(worker.email)).status).toBe(201);
    expect(await prisma.auditLog.count({ where: { organizationId, targetId: worker.id, action: { in: ['user.archived', 'user.restored'] } } })).toBe(2);
  });

  it('lets a manager block but not archive or restore, and keeps the last administrator', async () => {
    const admin = await createUser('solo', 'admin');
    const manager = await createUser('boss', 'manager');
    const adminHeaders = await headersFor(admin.email);
    const managerHeaders = await headersFor(manager.email);

    expect((await send('PATCH', `/users/${admin.id}/status`, { status: 'archived', confirm: true }, adminHeaders)).status).toBe(409);
    const learner = await createUser('learner', 'learner');
    const group = await prisma.group.create({ data: { organizationId, name: 'Team', slug: `team-${randomUUID()}` } });
    await prisma.groupMember.create({ data: { organizationId, groupId: group.id, userId: learner.id } });
    await prisma.managerGroup.create({ data: { organizationId, groupId: group.id, managerId: manager.id } });
    expect((await send('PATCH', `/users/${learner.id}/status`, { status: 'archived', confirm: true }, managerHeaders)).status).toBe(403);
  });
});
