/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service.js';
import type { CustomRolesService } from '../modules/custom-roles/custom-roles.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 481 acceptance criteria through the real HTTP stack and Postgres: a custom role gives exactly the granted
// checklist actions, nothing while the organization switch is off, nothing after revoke or archive,
// and the built-in roles behave as before.
const PASSWORD = 'CustomRoles1!';
const ANALYTICS_RANGE = '?from=2026-01-01T00:00:00.000Z&to=2026-12-31T00:00:00.000Z';

describe('custom roles on checklist routes — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let roles: CustomRolesService;
  let organizationId: string;
  const emails = new Map<string, string>();

  async function createUser(label: string, role: 'learner' | 'instructor') {
    const { hashPassword } = await import('../modules/auth/passwords.js');
    const email = `${label}-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: { organizationId, email, passwordHash: await hashPassword(PASSWORD), firstName: label, lastName: 'User' },
    });
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

  async function roleWith(name: string, grants: { action: string; scope: 'own' | 'assigned' | 'team' | 'department' | 'organization' }[]) {
    const role = await roles.createRole(organizationId, { name: `${name}-${randomUUID()}` });
    const updated = await roles.replacePermissions(organizationId, role.id, role.version, grants);
    return updated;
  }

  const setSwitch = (enabled: boolean) => prisma.organization.update({ where: { id: organizationId }, data: { customRolesEnabled: enabled } });
  const createSheet = (headers: Record<string, string>) =>
    fetch(`${baseUrl}/api/v1/checklists`, { method: 'POST', headers, body: JSON.stringify({ organizationId, title: 'Custom role sheet' }) });

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
    organizationId = (await prisma.organization.create({ data: { name: `CR checklists ${runId}`, slug: `cr-checklists-${runId}` } })).id;
  });

  afterAll(async () => {
    try {
      if (organizationId) {
        await prisma.checklist.deleteMany({ where: { organizationId } });
        await prisma.user.deleteMany({ where: { organizationId } });
        await prisma.organization.deleteMany({ where: { id: organizationId } });
      }
    } finally {
      await app?.close();
    }
  });

  it('gives an author right only while the switch is on, only the granted action, and stops after revoke and archive', async () => {
    const learner = await createUser('author', 'learner');
    const plain = await createUser('plain', 'learner');
    const role = await roleWith('Author', [{ action: 'checklist.library.read', scope: 'organization' }, { action: 'checklist.author', scope: 'organization' }]);
    await roles.assignRole(organizationId, learner, role.id);
    const headers = await headersFor(learner);
    const plainHeaders = await headersFor(plain);

    await setSwitch(false);
    expect((await createSheet(headers)).status).toBe(403);

    await setSwitch(true);
    expect((await createSheet(headers)).status).toBe(201);
    expect((await createSheet(plainHeaders)).status).toBe(403);
    // Not granted: team analytics, courses (another area), role management.
    expect((await fetch(`${baseUrl}/api/v1/checklists/manager-analytics${ANALYTICS_RANGE}`, { headers })).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/v1/courses`, { method: 'POST', headers, body: JSON.stringify({ organizationId, title: 'x' }) })).status).toBe(403);

    await roles.revokeRole(organizationId, learner, role.id);
    expect((await createSheet(headers)).status).toBe(403);

    await roles.assignRole(organizationId, learner, role.id);
    expect((await createSheet(headers)).status).toBe(201);
    await roles.archiveRole(organizationId, role.id, role.version);
    expect((await createSheet(headers)).status).toBe(403);
  });

  it('opens team analytics for a team grant and keeps the conduct-only observer out', async () => {
    const analyst = await createUser('analyst', 'learner');
    const observer = await createUser('observer', 'learner');
    const analystRole = await roleWith('Analyst', [{ action: 'checklist.library.read', scope: 'organization' }, { action: 'checklist.session.read', scope: 'team' }, { action: 'checklist.analytics.read', scope: 'team' }]);
    const observerRole = await roleWith('Observer', [{ action: 'checklist.library.read', scope: 'organization' }, { action: 'checklist.session.conduct', scope: 'assigned' }]);
    await roles.assignRole(organizationId, analyst, analystRole.id);
    await roles.assignRole(organizationId, observer, observerRole.id);
    await setSwitch(true);

    expect((await fetch(`${baseUrl}/api/v1/checklists/manager-analytics${ANALYTICS_RANGE}`, { headers: await headersFor(analyst) })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/v1/checklists/manager-analytics${ANALYTICS_RANGE}`, { headers: await headersFor(observer) })).status).toBe(403);
    expect((await createSheet(await headersFor(analyst))).status).toBe(403);
  });

  it('leaves the built-in roles unchanged with the switch on and off', async () => {
    const instructor = await createUser('instructor', 'instructor');
    const learner = await createUser('learner', 'learner');
    for (const enabled of [false, true]) {
      await setSwitch(enabled);
      expect((await createSheet(await headersFor(instructor))).status).toBe(201);
      expect((await createSheet(await headersFor(learner))).status).toBe(403);
    }
  });
});
