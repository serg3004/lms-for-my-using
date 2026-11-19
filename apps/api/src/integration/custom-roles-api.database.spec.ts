/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { findPermissionAction, type PermissionScope } from '@lms/shared/permission-catalog';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 484 acceptance criteria through the real HTTP stack and Postgres: only the administrator manages roles, grants are
// validated, versions give 409, organizations are isolated, and a revoked or archived role stops working on the next request.
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

describe('custom roles management API — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string;
  let otherOrganizationId: string;
  const emails = new Map<string, string>();

  async function createUser(label: string, role: 'learner' | 'instructor' | 'manager' | 'admin', orgId = organizationId) {
    const { hashPassword } = await import('../modules/auth/passwords.js');
    const email = `${label}-${randomUUID()}@example.test`;
    const user = await prisma.user.create({ data: { organizationId: orgId, email, passwordHash: await hashPassword(PASSWORD), firstName: label, lastName: 'User' } });
    await prisma.membership.create({ data: { organizationId: orgId, userId: user.id, role } });
    emails.set(user.id, email);
    return user.id;
  }

  async function headersFor(userId: string, orgId = organizationId) {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: orgId, email: emails.get(userId), password: PASSWORD }),
    });
    const body = (await response.json()) as { accessToken?: string; data?: { accessToken: string } };
    return { authorization: `Bearer ${body.accessToken ?? body.data?.accessToken}`, 'content-type': 'application/json' };
  }

  const call = (method: string, headers: Record<string, string>, path: string, body?: unknown) =>
    fetch(`${baseUrl}/api/v1${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const json = async <T>(response: Response) => {
    const body = (await response.json()) as T | { data: T };
    return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T;
  };
  type Role = { id: string; name: string; version: number; state: string; permissions: Grant[]; userCount?: number };
  const usersRead = withDependencies(['user.read'], 'organization');

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, { allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true' });
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'database-smoke-jwt-secret-32-characters';
    // Sequential on purpose: the module graph has cycles and parallel dynamic ESM imports can race on them.
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
    organizationId = (await prisma.organization.create({ data: { name: `CR api ${runId}`, slug: `cr-api-${runId}`, customRolesEnabled: true } })).id;
    otherOrganizationId = (await prisma.organization.create({ data: { name: `CR api other ${runId}`, slug: `cr-api-o-${runId}`, customRolesEnabled: true } })).id;
  });

  afterAll(async () => {
    try {
      for (const id of [organizationId, otherOrganizationId]) {
        if (id) {
          await prisma.user.deleteMany({ where: { organizationId: id } });
          await prisma.organization.deleteMany({ where: { id } });
        }
      }
    } finally {
      await app?.close();
    }
  });

  it('lets only the administrator manage roles and keeps the audit with the permission difference', async () => {
    const admin = await headersFor(await createUser('admin', 'admin'));
    for (const role of ['manager', 'instructor', 'learner'] as const) {
      const headers = await headersFor(await createUser(role, role));
      expect((await call('GET', headers, '/custom-roles')).status).toBe(403);
      expect((await call('POST', headers, '/custom-roles', { name: `x-${randomUUID()}` })).status).toBe(403);
      expect((await call('PUT', headers, `/custom-roles/${randomUUID()}/assignments/${randomUUID()}`)).status).toBe(403);
    }

    const created = await call('POST', admin, '/custom-roles', { name: 'Регистратор', description: 'Заводит учеников', permissions: usersRead });
    expect(created.status).toBe(201);
    const role = await json<Role>(created);
    expect(role.permissions).toEqual([{ action: 'user.read', scope: 'organization' }]);

    expect((await call('POST', admin, '/custom-roles', { name: 'Регистратор' })).status).toBe(409);
    const copy = await json<Role>(await call('POST', admin, '/custom-roles', { name: 'Регистратор 2', basedOnRoleId: role.id }));
    expect(copy.permissions).toEqual(role.permissions);
    expect(copy.id).not.toBe(role.id);

    const grown = withDependencies(['user.read', 'user.create'], 'organization');
    const updated = await call('PATCH', admin, `/custom-roles/${role.id}`, { version: role.version, permissions: grown, name: 'Регистратор учеников' });
    expect(updated.status).toBe(200);
    const next = await json<Role>(updated);
    expect(next.name).toBe('Регистратор учеников');
    expect(next.permissions.map((grant) => grant.action)).toEqual(['user.create', 'user.read']);
    expect((await call('PATCH', admin, `/custom-roles/${role.id}`, { version: role.version, name: 'Stale' })).status).toBe(409);
    expect((await call('POST', admin, `/custom-roles/${role.id}/archive`, { version: role.version })).status).toBe(409);

    const list = await json<Role[]>(await call('GET', admin, '/custom-roles'));
    expect(list.map((item) => item.name)).toEqual(expect.arrayContaining(['Регистратор учеников', 'Регистратор 2']));

    const archived = await call('POST', admin, `/custom-roles/${role.id}/archive`, { version: next.version });
    expect(archived.status).toBe(200);
    expect((await json<Role>(archived)).state).toBe('archived');
    expect((await json<Role[]>(await call('GET', admin, '/custom-roles?state=active'))).map((item) => item.id)).not.toContain(role.id);

    const audit = await prisma.auditLog.findMany({ where: { organizationId, targetId: role.id }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((entry) => entry.action)).toEqual(['custom_role.created', 'custom_role.updated', 'custom_role.archived']);
    expect(audit[1]?.metadata).toMatchObject({ added: ['user.create:organization'], renamedFrom: 'Регистратор' });
    expect(audit.every((entry) => entry.actorId !== null)).toBe(true);
  });

  it('refuses invalid sets: unknown, not delegable, wrong scope, missing dependency', async () => {
    const admin = await headersFor(await createUser('admin-validate', 'admin'));
    const post = (permissions: unknown) => call('POST', admin, '/custom-roles', { name: `v-${randomUUID()}`, permissions });
    expect((await post([{ action: 'no.such.action', scope: 'organization' }])).status).toBe(422);
    expect((await post([{ action: 'checklist.access.settings', scope: 'organization' }])).status).toBe(422);
    expect((await post([{ action: 'user.create', scope: 'team' }])).status).toBe(422);
    expect((await post([{ action: 'user.create', scope: 'organization' }])).status).toBe(422);
    expect((await post([{ action: 'user.read', scope: 'galaxy' }])).status).toBe(400);
    expect((await post(withDependencies(['user.create'], 'organization'))).status).toBe(201);
  });

  it('keeps organizations apart: foreign roles and users answer 404, nothing is assigned across', async () => {
    const admin = await headersFor(await createUser('admin-iso', 'admin'));
    const foreignAdmin = await headersFor(await createUser('admin-foreign', 'admin', otherOrganizationId), otherOrganizationId);
    const foreignUser = await createUser('learner-foreign', 'learner', otherOrganizationId);
    const foreign = await json<Role>(await call('POST', foreignAdmin, '/custom-roles', { name: 'Чужая', permissions: usersRead }));
    const own = await json<Role>(await call('POST', admin, '/custom-roles', { name: `Своя-${randomUUID()}`, permissions: usersRead }));
    const ownUser = await createUser('learner-own', 'learner');

    expect((await call('GET', admin, `/custom-roles/${foreign.id}`)).status).toBe(404);
    expect((await call('PATCH', admin, `/custom-roles/${foreign.id}`, { version: foreign.version, name: 'Hijack' })).status).toBe(404);
    expect((await call('POST', admin, `/custom-roles/${foreign.id}/archive`, { version: foreign.version })).status).toBe(404);
    expect((await call('POST', admin, '/custom-roles', { name: 'Копия', basedOnRoleId: foreign.id })).status).toBe(404);
    expect((await call('PUT', admin, `/custom-roles/${foreign.id}/assignments/${ownUser}`)).status).toBe(404);
    expect((await call('PUT', admin, `/custom-roles/${own.id}/assignments/${foreignUser}`)).status).toBe(404);
    expect((await call('GET', admin, `/custom-roles/users/${foreignUser}/permissions`)).status).toBe(404);
    expect((await json<Role[]>(await call('GET', admin, '/custom-roles'))).map((item) => item.id)).not.toContain(foreign.id);
    expect(await prisma.userCustomRoleAssignment.count({ where: { userId: foreignUser } })).toBe(0);
  });

  it('applies assignment, revocation and archiving on the next request without a new login', async () => {
    const admin = await headersFor(await createUser('admin-live', 'admin'));
    const learnerId = await createUser('learner-live', 'learner');
    const learner = await headersFor(learnerId);
    const role = await json<Role>(await call('POST', admin, '/custom-roles', { name: `Читатель-${randomUUID()}`, permissions: usersRead }));

    expect((await call('GET', learner, '/users')).status).toBe(403);
    expect((await call('PUT', admin, `/custom-roles/${role.id}/assignments/${learnerId}`)).status).toBe(200);
    expect((await json<Array<{ userId: string }>>(await call('GET', admin, `/custom-roles/${role.id}/assignments`))).map((row) => row.userId)).toEqual([learnerId]);
    expect((await call('GET', learner, '/users')).status).toBe(200);
    const meResponse = await call('GET', learner, '/me/permissions');
    const mine = await json<{ customRolesEnabled: boolean; customRoles: Array<{ id: string }>; permissions: Array<{ action: string; builtIn: boolean; scopes: string[] }> }>(meResponse);
    expect(mine.customRoles.map((item) => item.id)).toEqual([role.id]);
    expect(mine.permissions.find((item) => item.action === 'user.read')).toEqual({ action: 'user.read', builtIn: false, scopes: ['organization'] });
    expect((await json<{ permissions: unknown[] }>(await call('GET', admin, `/custom-roles/users/${learnerId}/permissions`))).permissions).toEqual(mine.permissions);

    expect((await call('DELETE', admin, `/custom-roles/${role.id}/assignments/${learnerId}`)).status).toBe(204);
    expect((await call('GET', learner, '/users')).status).toBe(403);
    expect((await call('DELETE', admin, `/custom-roles/${role.id}/assignments/${learnerId}`)).status).toBe(404);

    expect((await call('PUT', admin, `/custom-roles/${role.id}/assignments/${learnerId}`)).status).toBe(200);
    expect((await call('GET', learner, '/users')).status).toBe(200);
    expect((await call('POST', admin, `/custom-roles/${role.id}/archive`, { version: role.version })).status).toBe(200);
    expect((await call('GET', learner, '/users')).status).toBe(403);
    expect((await call('PUT', admin, `/custom-roles/${role.id}/assignments/${learnerId}`)).status).toBe(422);
    expect((await json<{ permissions: unknown[] }>(await call('GET', learner, '/me/permissions'))).permissions.find((item) => (item as { action: string }).action === 'user.read')).toBeUndefined();

    const audit = await prisma.auditLog.findMany({ where: { organizationId, targetId: learnerId, action: { startsWith: 'custom_role.' } }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((entry) => entry.action)).toEqual(['custom_role.assigned', 'custom_role.revoked', 'custom_role.assigned']);
    expect(audit.every((entry) => (entry.metadata as { roleId?: string }).roleId === role.id)).toBe(true);
  });
});
