/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { findPermissionAction, type PermissionScope } from '@lms/shared/permission-catalog';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 486 acceptance of custom roles through the real HTTP stack and Postgres. One probe request per area of the first
// version; the switch is turned on and off through the same endpoint the admin screen uses. The pure route-by-route guard
// is in modules/auth/custom-roles.acceptance.spec.ts.
const PASSWORD = 'CustomRoles1!';

type Grant = { action: string; scope: PermissionScope };

function withDependencies(actions: string[], scope: PermissionScope): Grant[] {
  const result = new Map<string, Grant>();
  const visit = (key: string) => {
    if (result.has(key)) return;
    const item = findPermissionAction(key)!;
    result.set(key, { action: key, scope: item.scopes.includes(scope) ? scope : item.scopes[item.scopes.length - 1]! });
    for (const required of item.requires) visit(required);
  };
  actions.forEach(visit);
  return [...result.values()];
}

describe('custom roles acceptance — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string;
  const emails = new Map<string, string>();
  const missing = randomUUID();

  // The seven areas of the first version: a request that only the named action opens, and what an opened request may answer
  // (a missing row is a 404 from the handler, which also proves the role guard let the request in).
  const probes: ReadonlyArray<{ area: string; action: string; path: string; method?: 'POST' }> = [
    { area: 'checklists', action: 'checklist.library.read', path: '/checklists' },
    { area: 'courses', action: 'course.edit', path: '/courses', method: 'POST' },
    { area: 'longreads', action: 'longread.edit', path: `/lessons/${missing}/longread/versions` },
    { area: 'tests', action: 'assessment.author', path: '/assessments', method: 'POST' },
    { area: 'attempts', action: 'assessment.attempt.read', path: `/assessments/${missing}/attempts` },
    { area: 'reports', action: 'report.course.read', path: `/reports/course-analytics/courses/${missing}` },
    { area: 'users', action: 'user.read', path: '/users' },
  ];

  async function createUser(label: string, role: 'learner' | 'instructor' | 'manager' | 'admin') {
    const { hashPassword } = await import('../modules/auth/passwords.js');
    const email = `${label}-${randomUUID()}@example.test`;
    const user = await prisma.user.create({ data: { organizationId, email, passwordHash: await hashPassword(PASSWORD), firstName: label, lastName: 'User' } });
    await prisma.membership.create({ data: { organizationId, userId: user.id, role } });
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

  const call = (method: string, headers: Record<string, string>, path: string, body?: unknown) =>
    fetch(`${baseUrl}/api/v1${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const json = async <T>(response: Response) => {
    const body = (await response.json()) as T | { data: T };
    return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T;
  };
  // A write probe sends only the organization: past the role guard it fails validation (400/422), at the guard it is a 403.
  const send = (headers: Record<string, string>, probe: { path: string; method?: 'POST' }) => call(probe.method ?? 'GET', headers, probe.path, probe.method ? { organizationId } : undefined);
  const refused = async (headers: Record<string, string>, probe: { path: string; method?: 'POST' }) => (await send(headers, probe)).status === 403;

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
    organizationId = (await prisma.organization.create({ data: { name: `CR acceptance ${runId}`, slug: `cr-acc-${runId}`, customRolesEnabled: false } })).id;
  });

  afterAll(async () => {
    try {
      if (organizationId) {
        await prisma.user.deleteMany({ where: { organizationId } });
        await prisma.organization.deleteMany({ where: { id: organizationId } });
      }
    } finally {
      await app?.close();
    }
  });

  it('covers the seven areas with one role: closed while the switch is off, open after it is turned on, closed after revoking', async () => {
    const admin = await headersFor(await createUser('admin', 'admin'));
    const holderId = await createUser('holder', 'learner');
    const holder = await headersFor(holderId);
    const other = await headersFor(await createUser('other', 'learner'));
    const grants = withDependencies(probes.map((probe) => probe.action), 'organization');
    const role = await json<{ id: string; version: number }>(await call('POST', admin, '/custom-roles', { name: `Семь областей ${randomUUID()}`, permissions: grants }));
    expect((await call('PUT', admin, `/custom-roles/${role.id}/assignments/${holderId}`)).status).toBe(200);

    // The switch is off: a role exists and is assigned, but nothing is granted (rollout state).
    for (const probe of probes) expect({ area: probe.area, refused: await refused(holder, probe) }).toEqual({ area: probe.area, refused: true });

    const features = (enabled: boolean) => call('PATCH', admin, `/organizations/${organizationId}/features`, { longreadEnabled: false, customRolesEnabled: enabled });
    expect((await features(true)).status).toBe(200);
    for (const probe of probes) {
      const response = await send(holder, probe);
      expect({ area: probe.area, status: response.status, passed: response.status !== 403 && response.status !== 401 }).toEqual({ area: probe.area, status: response.status, passed: true });
      expect({ area: probe.area, refused: await refused(other, probe) }).toEqual({ area: probe.area, refused: true });
    }

    expect((await call('DELETE', admin, `/custom-roles/${role.id}/assignments/${holderId}`)).status).toBe(204);
    for (const probe of probes) expect({ area: probe.area, refused: await refused(holder, probe) }).toEqual({ area: probe.area, refused: true });
  });

  it('opens each right alone: a role with one action opens only its own probe', async () => {
    const admin = await headersFor(await createUser('admin-one', 'admin'));
    await call('PATCH', admin, `/organizations/${organizationId}/features`, { longreadEnabled: false, customRolesEnabled: true });
    for (const probe of probes) {
      const holderId = await createUser(`one-${probe.area}`, 'learner');
      const holder = await headersFor(holderId);
      const role = await json<{ id: string }>(await call('POST', admin, '/custom-roles', { name: `Одно ${probe.area} ${randomUUID()}`, permissions: withDependencies([probe.action], 'organization') }));
      expect((await call('PUT', admin, `/custom-roles/${role.id}/assignments/${holderId}`)).status).toBe(200);
      for (const candidate of probes) {
        const closed = await refused(holder, candidate);
        const dependsOn = withDependencies([probe.action], 'organization').some((grant) => grant.action === candidate.action);
        expect({ held: probe.area, probe: candidate.area, closed }).toEqual({ held: probe.area, probe: candidate.area, closed: !dependsOn });
      }
    }
  });

  it('rolls the switch back and forth without losing roles, assignments or the built-in rights', async () => {
    const admin = await headersFor(await createUser('admin-rollback', 'admin'));
    const manager = await headersFor(await createUser('manager-rollback', 'manager'));
    const holderId = await createUser('holder-rollback', 'learner');
    const holder = await headersFor(holderId);
    const role = await json<{ id: string }>(await call('POST', admin, '/custom-roles', { name: `Откат ${randomUUID()}`, permissions: withDependencies(['user.read'], 'organization') }));
    await call('PUT', admin, `/custom-roles/${role.id}/assignments/${holderId}`);
    const features = (enabled: boolean) => call('PATCH', admin, `/organizations/${organizationId}/features`, { longreadEnabled: false, customRolesEnabled: enabled });

    expect((await features(true)).status).toBe(200);
    expect((await call('GET', holder, '/users')).status).toBe(200);
    const builtInBefore = (await call('GET', manager, '/users')).status;

    // Roll back: the next request already sees only the built-in policies; the data stays.
    expect((await features(false)).status).toBe(200);
    expect((await call('GET', holder, '/users')).status).toBe(403);
    expect((await call('GET', manager, '/users')).status).toBe(builtInBefore);
    expect((await call('GET', admin, '/users')).status).toBe(200);
    expect(await prisma.customRole.count({ where: { organizationId, id: role.id } })).toBe(1);
    expect(await prisma.userCustomRoleAssignment.count({ where: { organizationId, roleId: role.id, userId: holderId, state: 'active' } })).toBe(1);
    expect((await json<{ customRolesEnabled: boolean; permissions: Array<{ action: string; builtIn: boolean }> }>(await call('GET', holder, '/me/permissions'))).customRolesEnabled).toBe(false);

    // Switch on again: the same role works at once, nothing has to be re-created.
    expect((await features(true)).status).toBe(200);
    expect((await call('GET', holder, '/users')).status).toBe(200);

    // The administrator never loses the management of roles because of the switch.
    expect((await features(false)).status).toBe(200);
    expect((await call('GET', admin, '/custom-roles')).status).toBe(200);
  });
});
