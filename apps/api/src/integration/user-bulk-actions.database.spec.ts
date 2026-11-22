/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 497: one action over many users, a report per person, the manager's team scope and the protection of the last administrator.
const PASSWORD = 'Bulk1!Bulk1Pass';

type Item = { userId: string; status: string; reason?: string };
type Report = { action: string; summary: { requested: number; done: number; unchanged: number; failed: number }; items: Item[] };

describe('bulk actions over users — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string;

  async function createUser(label: string, role: 'learner' | 'admin' | 'manager', status: 'active' | 'suspended' = 'active') {
    const { hashPassword } = await import('../modules/auth/passwords.js');
    const email = `${label}-${randomUUID()}@example.test`;
    const user = await prisma.user.create({ data: { organizationId, email, status, passwordHash: await hashPassword(PASSWORD), firstName: label, lastName: 'Person' } });
    await prisma.membership.create({ data: { organizationId, userId: user.id, role } });
    return { id: user.id, email };
  }

  const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => fetch(`${baseUrl}/api/v1${path}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  async function headersFor(email: string) {
    const response = await send('POST', '/auth/login', { organizationId, email, password: PASSWORD });
    const body = (await response.json()) as { accessToken?: string; data?: { accessToken: string } };
    return { authorization: `Bearer ${body.accessToken ?? body.data?.accessToken}` };
  }
  async function bulk(headers: Record<string, string>, body: unknown) {
    const response = await send('POST', '/users/bulk-actions', body, headers);
    const json = (await response.json()) as Report & { data?: Report };
    return { status: response.status, report: json.data ?? json };
  }
  const statusOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).status;

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
    organizationId = (await prisma.organization.create({ data: { name: `Bulk ${runId}`, slug: `bulk-${runId}` } })).id;
  });

  afterAll(async () => {
    try {
      if (organizationId) {
        await prisma.auditLog.deleteMany({ where: { organizationId } });
        await prisma.departmentMembership.deleteMany({ where: { organizationId } });
        await prisma.department.deleteMany({ where: { organizationId } });
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

  it('blocks and unblocks a batch with a report per person, is repeatable, and never touches yourself', async () => {
    const admin = await createUser('admin', 'admin');
    const a = await createUser('a', 'learner');
    const b = await createUser('b', 'learner', 'suspended');
    const adminHeaders = await headersFor(admin.email);
    const missing = randomUUID();

    const first = await bulk(adminHeaders, { action: 'suspend', userIds: [a.id, b.id, admin.id, missing] });
    expect(first.status).toBe(201);
    const byId = new Map(first.report.items.map((item) => [item.userId, item]));
    expect(byId.get(a.id)?.status).toBe('done');
    expect(byId.get(b.id)?.status).toBe('unchanged');
    expect(byId.get(admin.id)).toMatchObject({ status: 'conflict', reason: 'self' });
    expect(byId.get(missing)?.status).toBe('notFound');
    expect(first.report.summary).toEqual({ requested: 4, done: 1, unchanged: 1, failed: 2 });
    expect(await statusOf(a.id)).toBe('suspended');
    expect(await statusOf(admin.id)).toBe('active');

    expect((await bulk(adminHeaders, { action: 'suspend', userIds: [a.id] })).report.items[0]?.status).toBe('unchanged');

    const ok = await bulk(adminHeaders, { action: 'activate', userIds: [a.id, b.id, admin.id] });
    expect(ok.report.summary).toEqual({ requested: 3, done: 2, unchanged: 1, failed: 0 });
    expect(await statusOf(b.id)).toBe('active');
    expect(await prisma.auditLog.count({ where: { organizationId, action: 'user.bulk_action' } })).toBeGreaterThanOrEqual(3);
  });

  it('keeps the last active administrator', async () => {
    const { id: orgId } = await prisma.organization.create({ data: { name: `Solo ${randomUUID()}`, slug: `solo-${randomUUID()}` } });
    try {
      const { hashPassword } = await import('../modules/auth/passwords.js');
      const make = async (label: string, role: 'admin' | 'manager') => {
        const email = `${label}-${randomUUID()}@example.test`;
        const user = await prisma.user.create({ data: { organizationId: orgId, email, passwordHash: await hashPassword(PASSWORD), firstName: label, lastName: 'Person' } });
        await prisma.membership.create({ data: { organizationId: orgId, userId: user.id, role } });
        return { id: user.id, email };
      };
      const onlyAdmin = await make('only', 'admin');
      const manager = await make('mgr', 'manager');
      const login = await send('POST', '/auth/login', { organizationId: orgId, email: manager.email, password: PASSWORD });
      const body = (await login.json()) as { accessToken?: string; data?: { accessToken: string } };
      const managerHeaders = { authorization: `Bearer ${body.accessToken ?? body.data?.accessToken}` };
      // A manager does not see the administrator at all (outside the team), so it is "not found", and the single route keeps the guard as well.
      expect((await bulk(managerHeaders, { action: 'suspend', userIds: [onlyAdmin.id] })).report.items[0]?.status).toBe('notFound');
      expect(await statusOf(onlyAdmin.id)).toBe('active');
      const { UsersService } = await import('../modules/users/users.service.js');
      const users = app.get(UsersService);
      await expect(users.updateUserStatus(onlyAdmin.id, { id: manager.id, organizationId: orgId, roles: ['admin'] } as never, 'suspended')).rejects.toThrow('last active administrator');
    } finally {
      await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
      await prisma.user.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
  });

  it('archives only with confirmation and only for an administrator; the impact is summed', async () => {
    const admin = await createUser('boss', 'admin');
    const manager = await createUser('lead', 'manager');
    const a = await createUser('p', 'learner');
    const b = await createUser('q', 'learner');
    const course = await prisma.course.create({ data: { organizationId, title: 'Safety', slug: `safety-${randomUUID()}` } });
    await prisma.assignment.createMany({ data: [{ organizationId, courseId: course.id, userId: a.id }, { organizationId, courseId: course.id, userId: b.id }] });
    const adminHeaders = await headersFor(admin.email);

    const impact = await send('POST', '/users/bulk-actions/impact', { userIds: [a.id, b.id] }, adminHeaders);
    const impactBody = (await impact.json()) as { users?: number; openAssignments?: number; data?: { users: number; openAssignments: number } };
    expect(impactBody.data?.openAssignments ?? impactBody.openAssignments).toBe(2);

    expect((await send('POST', '/users/bulk-actions', { action: 'archive', userIds: [a.id, b.id] }, adminHeaders)).status).toBe(409);
    expect((await send('POST', '/users/bulk-actions', { action: 'archive', userIds: [a.id], confirm: true }, await headersFor(manager.email))).status).toBe(403);
    const done = await bulk(adminHeaders, { action: 'archive', userIds: [a.id, b.id], confirm: true });
    expect(done.report.summary.done).toBe(2);
    expect(await statusOf(a.id)).toBe('archived');
    expect((await bulk(adminHeaders, { action: 'archive', userIds: [a.id], confirm: true })).report.items[0]?.status).toBe('unchanged');
    expect((await bulk(adminHeaders, { action: 'suspend', userIds: [a.id] })).report.items[0]).toMatchObject({ status: 'conflict', reason: 'archived' });
  });

  it('keeps a manager inside their team and moves people between departments', async () => {
    const admin = await createUser('root', 'admin');
    const manager = await createUser('chief', 'manager');
    const inTeam = await createUser('mine', 'learner');
    const outside = await createUser('theirs', 'learner');
    const group = await prisma.group.create({ data: { organizationId, name: 'Team', slug: `team-${randomUUID()}` } });
    await prisma.groupMember.create({ data: { organizationId, groupId: group.id, userId: inTeam.id } });
    await prisma.managerGroup.create({ data: { organizationId, groupId: group.id, managerId: manager.id } });
    const managerHeaders = await headersFor(manager.email);

    const blocked = await bulk(managerHeaders, { action: 'suspend', userIds: [inTeam.id, outside.id] });
    expect(blocked.report.items.find((item) => item.userId === inTeam.id)?.status).toBe('done');
    expect(blocked.report.items.find((item) => item.userId === outside.id)?.status).toBe('notFound');
    expect(await statusOf(outside.id)).toBe('active');

    const sales = await prisma.department.create({ data: { organizationId, name: 'Sales' } });
    const stock = await prisma.department.create({ data: { organizationId, name: 'Stock' } });
    await prisma.departmentMembership.create({ data: { organizationId, userId: outside.id, departmentId: sales.id, isPrimary: true } });
    const adminHeaders = await headersFor(admin.email);
    const moved = await bulk(adminHeaders, { action: 'move', userIds: [outside.id, inTeam.id], departmentId: stock.id });
    expect(moved.report.summary.done).toBe(2);
    expect(await prisma.departmentMembership.count({ where: { organizationId, userId: outside.id, isPrimary: true, effectiveTo: null, departmentId: stock.id } })).toBe(1);
    expect(await prisma.departmentMembership.count({ where: { organizationId, userId: outside.id, departmentId: sales.id, effectiveTo: { not: null } } })).toBe(1);
    expect((await bulk(adminHeaders, { action: 'move', userIds: [outside.id], departmentId: stock.id })).report.items[0]?.status).toBe('unchanged');
    expect((await send('POST', '/users/bulk-actions', { action: 'move', userIds: [outside.id], departmentId: randomUUID() }, adminHeaders)).status).toBe(404);
    expect((await send('POST', '/users/bulk-actions', { action: 'move', userIds: [outside.id] }, adminHeaders)).status).toBe(400);
  });

  it('works on everyone matching a filter and refuses a malformed target', async () => {
    const admin = await createUser('filterer', 'admin');
    const tag = `zz${randomUUID().slice(0, 6)}`;
    const people = await Promise.all([createUser(`${tag}1`, 'learner'), createUser(`${tag}2`, 'learner')]);
    const adminHeaders = await headersFor(admin.email);
    const result = await bulk(adminHeaders, { action: 'suspend', filter: { search: tag, status: 'active' } });
    expect(result.report.summary).toMatchObject({ requested: 2, done: 2 });
    expect(await statusOf(people[0]!.id)).toBe('suspended');
    expect((await send('POST', '/users/bulk-actions', { action: 'suspend', userIds: [people[0]!.id], filter: {} }, adminHeaders)).status).toBe(400);
    expect((await send('POST', '/users/bulk-actions', { action: 'suspend' }, adminHeaders)).status).toBe(400);
    expect((await send('POST', '/users/bulk-actions', { action: 'suspend', userIds: [people[0]!.id] }, {})).status).toBe(401);
  });
});
