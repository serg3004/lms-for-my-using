/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { findPermissionAction, type PermissionScope } from '@lms/shared/permission-catalog';

import type { PrismaService } from '../database/prisma.service.js';
import type { CustomRolesService } from '../modules/custom-roles/custom-roles.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 483 acceptance criteria through the real HTTP stack and Postgres: a delegated registrar works only in the own
// department, never raises rights, never touches administrators or other roles, and every action is audited.
const PASSWORD = 'CustomRoles1!';

type Grant = { action: string; scope: PermissionScope };

function withDependencies(actions: string[], scope: PermissionScope): Grant[] {
  const result = new Map<string, Grant>();
  const visit = (key: string) => {
    if (result.has(key)) return;
    const item = findPermissionAction(key)!;
    const chosen = item.scopes.includes(scope) ? scope : item.scopes[item.scopes.length - 1]!;
    result.set(key, { action: key, scope: chosen });
    for (const required of item.requires) visit(required);
  };
  actions.forEach(visit);
  return [...result.values()];
}

describe('custom roles on user routes — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let roles: CustomRolesService;
  let organizationId: string;
  let deptA: string;
  let deptA1: string;
  let deptB: string;
  const emails = new Map<string, string>();

  async function createUser(label: string, role: 'learner' | 'instructor' | 'manager' | 'admin', departmentId?: string) {
    const { hashPassword } = await import('../modules/auth/passwords.js');
    const email = `${label}-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: { organizationId, email, passwordHash: await hashPassword(PASSWORD), firstName: label, lastName: 'User' },
    });
    await prisma.membership.create({ data: { organizationId, userId: user.id, role } });
    if (departmentId) await prisma.departmentMembership.create({ data: { organizationId, userId: user.id, departmentId, isPrimary: true } });
    emails.set(user.id, email);
    return user.id;
  }

  async function headersFor(userId: string) {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId, email: emails.get(userId), password: PASSWORD }),
    });
    const body = (await response.json()) as { accessToken?: string; data?: { accessToken: string } };
    return { authorization: `Bearer ${body.accessToken ?? body.data?.accessToken}`, 'content-type': 'application/json' };
  }

  async function registrar(label: string, scope: PermissionScope, departmentId?: string) {
    const userId = await createUser(label, 'learner', departmentId);
    const role = await roles.createRole(organizationId, { name: `registrar-${randomUUID()}` });
    await roles.replacePermissions(organizationId, role.id, role.version, withDependencies(['user.read', 'user.create', 'user.import', 'user.update', 'user.deactivate'], scope));
    await roles.assignRole(organizationId, userId, role.id);
    return { userId, headers: await headersFor(userId) };
  }

  const setSwitch = (enabled: boolean) => prisma.organization.update({ where: { id: organizationId }, data: { customRolesEnabled: enabled } });
  const newUser = (extra: Record<string, unknown> = {}) => ({
    organizationId,
    email: `new-${randomUUID()}@example.test`,
    password: 'Password123!',
    firstName: 'New',
    lastName: 'Person',
    ...extra,
  });
  const post = (headers: Record<string, string>, path: string, body: unknown) =>
    fetch(`${baseUrl}/api/v1${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const patch = (headers: Record<string, string>, path: string, body: unknown) =>
    fetch(`${baseUrl}/api/v1${path}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
  const json = async <T>(response: Response) => {
    const body = (await response.json()) as T | { data: T };
    return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T;
  };

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'database-smoke-jwt-secret-32-characters';
    // Sequential on purpose: the module graph has cycles and parallel dynamic ESM imports can race on them.
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../app.module.js');
    const { PrismaService: Prisma } = await import('../database/prisma.service.js');
    const { CustomRolesService: Roles } = await import('../modules/custom-roles/custom-roles.service.js');
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = testingModule.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    prisma = app.get(Prisma);
    roles = new Roles(prisma);
    const runId = randomUUID();
    organizationId = (await prisma.organization.create({ data: { name: `CR users ${runId}`, slug: `cr-users-${runId}`, customRolesEnabled: true } })).id;
    deptA = (await prisma.department.create({ data: { organizationId, name: 'A' } })).id;
    deptA1 = (await prisma.department.create({ data: { organizationId, name: 'A1', parentId: deptA } })).id;
    deptB = (await prisma.department.create({ data: { organizationId, name: 'B' } })).id;
  });

  afterAll(async () => {
    try {
      if (organizationId) {
        await prisma.departmentMembership.deleteMany({ where: { organizationId } });
        await prisma.user.deleteMany({ where: { organizationId } });
        await prisma.department.deleteMany({ where: { organizationId, parentId: { not: null } } });
        await prisma.department.deleteMany({ where: { organizationId } });
        await prisma.organization.deleteMany({ where: { id: organizationId } });
      }
    } finally {
      await app?.close();
    }
  });

  it('a department registrar creates learners only inside the own department tree and every action is audited', async () => {
    const { headers } = await registrar('dept-registrar', 'department', deptA);

    await setSwitch(false);
    expect((await post(headers, '/users', newUser({ departmentId: deptA1 }))).status).toBe(403);
    await setSwitch(true);

    const created = await post(headers, '/users', newUser({ departmentId: deptA1 }));
    expect(created.status).toBe(201);
    const user = await json<{ id: string; memberships: Array<{ role: string }> }>(created);
    expect(user.memberships.map((membership) => membership.role)).toEqual(['learner']);
    const placement = await prisma.departmentMembership.findMany({ where: { organizationId, userId: user.id } });
    expect(placement).toMatchObject([{ departmentId: deptA1, isPrimary: true, effectiveTo: null }]);
    const audit = await prisma.auditLog.findFirst({ where: { organizationId, action: 'user.created', targetId: user.id } });
    expect(audit?.metadata).toMatchObject({ departmentId: deptA1, delegated: 'department' });

    expect((await post(headers, '/users', newUser({ departmentId: deptB }))).status).toBe(403);
    expect((await post(headers, '/users', newUser())).status).toBe(403);

    const bulk = await post(headers, '/users/bulk', { organizationId, departmentId: deptA, users: [{ email: `b1-${randomUUID()}@example.test`, password: 'Password123!', firstName: 'B', lastName: 'One' }] });
    expect(bulk.status).toBe(201);
    expect((await post(headers, '/users/bulk', { organizationId, departmentId: deptB, users: [{ email: `b2-${randomUUID()}@example.test`, password: 'Password123!', firstName: 'B', lastName: 'Two' }] })).status).toBe(403);

    const imported = await post(headers, '/users/import', { organizationId, departmentId: deptA1, mode: 'create', users: [{ email: `i1-${randomUUID()}@example.test`, password: 'Password123!', firstName: 'I', lastName: 'One' }] });
    expect(imported.status).toBe(201);
    expect((await json<{ createdCount: number }>(imported)).createdCount).toBe(1);
    expect((await post(headers, '/users/import', { organizationId, departmentId: deptB, mode: 'create', users: [{ email: `i2-${randomUUID()}@example.test`, password: 'Password123!', firstName: 'I', lastName: 'Two' }] })).status).toBe(403);
  });

  it('sees, edits and suspends only learners of the own department, never roles, administrators, other roles or itself', async () => {
    const { userId: registrarId, headers } = await registrar('dept-registrar-2', 'department', deptA);
    const inside = await createUser('inside', 'learner', deptA1);
    const outside = await createUser('outside', 'learner', deptB);
    const instructor = await createUser('inside-instructor', 'instructor', deptA);
    const admin = await createUser('inside-admin', 'admin', deptA);

    const list = await json<{ items: Array<{ id: string }> }>(await fetch(`${baseUrl}/api/v1/users?pageSize=100`, { headers }));
    const ids = list.items.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([inside, registrarId]));
    expect(ids).not.toContain(outside);
    expect((await fetch(`${baseUrl}/api/v1/users/${inside}`, { headers })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/v1/users/${outside}`, { headers })).status).toBe(404);

    expect((await patch(headers, `/users/${inside}`, { email: `inside-${randomUUID()}@example.test`, firstName: 'Changed', lastName: 'User' })).status).toBe(200);
    expect((await patch(headers, `/users/${outside}`, { email: `o-${randomUUID()}@example.test`, firstName: 'No', lastName: 'Way' })).status).toBe(404);
    expect((await patch(headers, `/users/${instructor}`, { email: `i-${randomUUID()}@example.test`, firstName: 'No', lastName: 'Way' })).status).toBe(404);
    expect((await patch(headers, `/users/${admin}`, { email: `a-${randomUUID()}@example.test`, firstName: 'No', lastName: 'Way' })).status).toBe(404);
    expect((await patch(headers, `/users/${registrarId}`, { email: `r-${randomUUID()}@example.test`, firstName: 'Me', lastName: 'Self' })).status).toBe(404);
    expect((await patch(headers, `/users/${inside}`, { email: `inside-${randomUUID()}@example.test`, firstName: 'Changed', lastName: 'User', role: 'admin' })).status).toBe(403);
    expect((await prisma.membership.findMany({ where: { organizationId, userId: inside } })).map((membership) => membership.role)).toEqual(['learner']);

    expect((await patch(headers, `/users/${inside}/status`, { status: 'suspended' })).status).toBe(200);
    expect((await patch(headers, `/users/${outside}/status`, { status: 'suspended' })).status).toBe(404);
    expect((await patch(headers, `/users/${admin}/status`, { status: 'suspended' })).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/v1/users/${inside}/status-impact`, { headers })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/v1/users/${outside}/status-impact`, { headers })).status).toBe(404);
    const audit = await prisma.auditLog.findFirst({ where: { organizationId, action: 'user.status_changed', targetId: inside } });
    expect(audit?.actorId).toBe(registrarId);
    expect(audit?.metadata).toMatchObject({ delegated: 'department' });

    expect((await post(headers, '/memberships', { organizationId, userId: inside, role: 'admin' })).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/v1/organizations/${organizationId}/features`, { method: 'PATCH', headers, body: JSON.stringify({ longreadEnabled: true, customRolesEnabled: false }) })).status).toBe(403);
  });

  it('an organization registrar works across departments but keeps the same limits on roles and administrators', async () => {
    const { headers } = await registrar('org-registrar', 'organization');
    const other = await createUser('other-dept', 'learner', deptB);
    const admin = await createUser('org-admin', 'admin', deptB);

    const created = await post(headers, '/users', newUser());
    expect(created.status).toBe(201);
    expect((await json<{ memberships: Array<{ role: string }> }>(created)).memberships.map((membership) => membership.role)).toEqual(['learner']);
    expect((await patch(headers, `/users/${other}`, { email: `o-${randomUUID()}@example.test`, firstName: 'Fine', lastName: 'Edit' })).status).toBe(200);
    expect((await patch(headers, `/users/${admin}`, { email: `a-${randomUUID()}@example.test`, firstName: 'No', lastName: 'Way' })).status).toBe(404);
    expect((await patch(headers, `/users/${other}`, { email: `o-${randomUUID()}@example.test`, firstName: 'Fine', lastName: 'Edit', role: 'manager' })).status).toBe(403);
  });

  it('keeps the built-in administrator and manager as they were', async () => {
    const adminId = await createUser('builtin-admin', 'admin');
    const managerId = await createUser('builtin-manager', 'manager');
    const target = await createUser('builtin-target', 'learner');
    for (const enabled of [false, true]) {
      await setSwitch(enabled);
      const created = await post(await headersFor(managerId), '/users', newUser());
      expect(created.status).toBe(201);
      expect((await json<{ memberships: unknown[] }>(created)).memberships).toEqual([]);
      expect((await patch(await headersFor(adminId), `/users/${target}`, { email: `t-${randomUUID()}@example.test`, firstName: 'Promoted', lastName: 'User', role: 'instructor' })).status).toBe(200);
      expect((await prisma.membership.findMany({ where: { organizationId, userId: target } })).map((membership) => membership.role)).toEqual(['instructor']);
      await prisma.membership.deleteMany({ where: { organizationId, userId: target } });
      await prisma.membership.create({ data: { organizationId, userId: target, role: 'learner' } });
    }
  });
});
