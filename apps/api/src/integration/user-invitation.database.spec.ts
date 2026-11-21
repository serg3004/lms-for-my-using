/// <reference types="jest" />

import { jest } from '@jest/globals';
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
  it.each(['/users', '/users/bulk', '/users/import'])('PR 490: assigns role and department atomically through %s', async (path) => {
    const admin = await createUser('placement-admin', 'admin');
    const headers = await headersFor(admin);
    const department = await prisma.department.create({ data: { organizationId, name: 'Placement' } });
    const email = `placed-${randomUUID()}@example.test`;
    const person = { email, firstName: 'Placed', lastName: 'User', password: PASSWORD };
    const placement = { organizationId, role: 'mentor', departmentId: department.id };
    const payload = path === '/users' ? { ...placement, ...person } : { ...placement, mode: 'create', users: [person] };
    expect((await post(path, payload, headers)).status).toBe(201);
    const user = await prisma.user.findFirstOrThrow({ where: { organizationId, email }, include: { memberships: true, departmentMemberships: true } });
    expect(user.memberships.map((m) => m.role)).toEqual(['mentor']);
    expect(user.departmentMemberships).toEqual([expect.objectContaining({ departmentId: department.id, isPrimary: true })]);
  });

  it.each(['/users', '/users/bulk', '/users/import'])('PR 490: denies role escalation and foreign departments through %s', async (path) => {
    const manager = await createUser('placement-manager', 'manager');
    const admin = await createUser('placement-admin', 'admin');
    const own = await prisma.department.create({ data: { organizationId, name: 'Managed' } });
    const child = await prisma.department.create({ data: { organizationId, parentId: own.id, name: 'Managed child' } });
    const outside = await prisma.department.create({ data: { organizationId, name: 'Outside' } });
    const foreign = await prisma.department.create({ data: { organizationId: otherOrganizationId, name: 'Foreign' } });
    await prisma.departmentManager.create({ data: { organizationId, userId: manager.userId, departmentId: own.id, type: 'DIRECT' } });
    const headers = await headersFor(manager);
    const email = `restricted-${randomUUID()}@example.test`;
    const person = { email, firstName: 'Restricted', lastName: 'User', password: PASSWORD };
    const payload = (departmentId: string, role?: string) => path === '/users'
      ? { organizationId, departmentId, role, ...person }
      : { organizationId, departmentId, role, mode: 'create', users: [person] };
    expect((await post(path, payload(own.id, 'admin'), headers)).status).toBe(403);
    expect((await post(path, payload(outside.id), headers)).status).toBe(403);
    expect((await post(path, payload(foreign.id), await headersFor(admin))).status).toBe(404);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
    expect((await post(path, payload(child.id), headers)).status).toBe(201);
    const user = await prisma.user.findFirstOrThrow({ where: { email }, include: { memberships: true } });
    expect(user.memberships.map((m) => m.role)).toEqual(['learner']);
  });

  it.each(['single', 'bulk', 'import'])('PR 490: rolls back every user on a role insert failure (%s)', async (mode) => {
    const { UsersService } = await import('../modules/users/users.service.js');
    const { createUserRequestSchema, createBulkUsersSchema, importUsersSchema } = await import('../modules/users/users.schemas.js');
    const service = app.get(UsersService);
    // A missing assigning actor violates the real membership FK after the user has been inserted.
    const actor = { id: randomUUID(), organizationId, roles: ['admin'] };
    const email = `rollback-${randomUUID()}@example.test`;
    const person = { email, firstName: 'Rollback', lastName: 'User', password: PASSWORD };
    const common = { organizationId, role: 'learner' };
    const pending = mode === 'single' ? service.createUser(createUserRequestSchema.parse({ ...common, ...person }), actor.id, actor)
      : mode === 'bulk' ? service.createBulkUsers(createBulkUsersSchema.parse({ ...common, users: [person, { ...person, email: `second-${email}` }] }), actor)
        : service.importUsers(importUsersSchema.parse({ ...common, mode: 'create', users: [person, { ...person, email: `second-${email}` }] }), actor);
    await expect(pending).rejects.toThrow();
    expect(await prisma.user.count({ where: { email: { in: [email, `second-${email}`] } } })).toBe(0);
  });

  it('PR 490: rolls back the user, role, department and token when invitation preparation fails', async () => {
    const { AuthService } = await import('../modules/auth/auth.service.js');
    const auth = app.get(AuthService);
    const original = auth.prepareInvitationFor.bind(auth);
    const admin = await createUser('rollback-invite-admin', 'admin');
    const department = await prisma.department.create({ data: { organizationId, name: 'Rollback invitation' } });
    const email = `invite-rollback-${randomUUID()}@example.test`;
    let insertedId = '';
    const spy = jest.spyOn(auth, 'prepareInvitationFor').mockImplementationOnce(async (...args) => {
      insertedId = args[0].id;
      await original(...args);
      throw new Error('Invitation preparation failed');
    });
    try {
      expect((await post('/users', { organizationId, email, firstName: 'Rollback', lastName: 'Invite', role: 'learner', departmentId: department.id }, await headersFor(admin))).status).toBe(500);
      expect(insertedId).not.toBe('');
      expect(await prisma.user.count({ where: { id: insertedId } })).toBe(0);
      expect(await prisma.membership.count({ where: { userId: insertedId } })).toBe(0);
      expect(await prisma.departmentMembership.count({ where: { userId: insertedId } })).toBe(0);
      expect(await prisma.userInvitation.count({ where: { userId: insertedId } })).toBe(0);
    } finally { spy.mockRestore(); }
  });


  type ImportReport = { createdCount: number; skippedCount: number; rows: Array<{ status: string; errors: string[]; invited?: boolean; invitationDelivered?: boolean }> };
  const reportOf = async (response: Response) => {
    const body = (await response.json()) as { data?: ImportReport } & Partial<ImportReport>;
    return (body.data ?? body) as ImportReport;
  };

  it('PR 492: imports rows without a password as invitations, places them by department and role names, and never duplicates on a second upload', async () => {
    const admin = await createUser('import-admin', 'admin');
    const headers = await headersFor(admin);
    const department = await prisma.department.create({ data: { organizationId, name: 'Склад импорта' } });
    const email = `imported-${randomUUID()}@example.test`;
    const payload = { organizationId, mode: 'create', users: [{ email, firstName: 'Айгуль', lastName: 'Импорт', department: 'склад импорта', role: 'Наставник' }] };

    const first = await post('/users/import', payload, headers);
    expect(first.status).toBe(201);
    const report = await reportOf(first);
    expect(report.createdCount).toBe(1);
    expect(report.rows[0]).toMatchObject({ status: 'created', invited: true, invitationDelivered: false });

    const user = await prisma.user.findFirstOrThrow({ where: { organizationId, email }, include: { memberships: true, departmentMemberships: true, invitations: true } });
    expect(user.status).toBe('invited');
    expect(user.memberships.map((m) => m.role)).toEqual(['mentor']);
    expect(user.departmentMemberships).toEqual([expect.objectContaining({ departmentId: department.id, isPrimary: true })]);
    expect(user.invitations).toHaveLength(1);

    const second = await reportOf(await post('/users/import', payload, headers));
    expect(second.createdCount).toBe(0);
    expect(second.rows[0]?.errors).toContain('User email already exists in organization');
    expect(await prisma.user.count({ where: { organizationId, email } })).toBe(1);
  });

  it('PR 492: refuses rows with an unknown or ambiguous department and an unknown role, and creates nothing in validation mode', async () => {
    const admin = await createUser('import-admin2', 'admin');
    const headers = await headersFor(admin);
    await prisma.department.createMany({ data: [{ organizationId, name: 'Двойник' }, { organizationId, name: 'двойник' }] });
    const stamp = randomUUID();
    const row = (label: string, extra: Record<string, string>) => ({ email: `${label}-${stamp}@example.test`, firstName: label, lastName: 'Row', ...extra });
    const report = await reportOf(await post('/users/import', { organizationId, mode: 'validateOnly', users: [
      row('missing', { department: 'Нет такого' }), row('ambiguous', { department: 'Двойник' }), row('role', { role: 'король' }), row('fine', {}),
    ] }, headers));
    expect(report.rows.map((entry) => entry.errors[0])).toEqual(['Department not found', 'Department name is ambiguous', 'Role not found', undefined]);
    expect(await prisma.user.count({ where: { organizationId, email: { contains: stamp } } })).toBe(0);

    const created = await reportOf(await post('/users/import', { organizationId, mode: 'create', users: [row('missing2', { department: 'Нет такого' }), row('fine2', {})] }, headers));
    expect(created.createdCount).toBe(1);
    expect(created.rows.map((entry) => entry.status)).toEqual(['skipped', 'created']);
  });

  it('PR 492: a manager imports only into the own team, with no roles, and a row outside the area is refused on its own', async () => {
    const manager = await createUser('import-manager', 'manager');
    const own = await prisma.department.create({ data: { organizationId, name: 'Своя команда импорта' } });
    const child = await prisma.department.create({ data: { organizationId, parentId: own.id, name: 'Дочерняя команда импорта' } });
    const outside = await prisma.department.create({ data: { organizationId, name: 'Чужая команда импорта' } });
    await prisma.departmentManager.create({ data: { organizationId, userId: manager.userId, departmentId: own.id, type: 'DIRECT' } });
    const headers = await headersFor(manager);
    const stamp = randomUUID();
    const row = (label: string, extra: Record<string, string>) => ({ email: `${label}-${stamp}@example.test`, firstName: label, lastName: 'Team', ...extra });

    const report = await reportOf(await post('/users/import', { organizationId, mode: 'create', users: [
      row('inside', { department: child.name }), row('outside', { department: outside.name }), row('nodept', {}), row('role', { department: own.name, role: 'admin' }),
    ] }, headers));
    expect(report.rows.map((entry) => entry.errors[0])).toEqual([undefined, 'The department is outside your area', 'Department is required', 'Roles are granted by an administrator']);
    expect(report.createdCount).toBe(1);
    const created = await prisma.user.findFirstOrThrow({ where: { organizationId, email: `inside-${stamp}@example.test` }, include: { memberships: true, departmentMemberships: true } });
    expect(created.memberships.map((m) => m.role)).toEqual(['learner']);
    expect(created.departmentMemberships[0]?.departmentId).toBe(child.id);
  });

});
