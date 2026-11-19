/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { findPermissionAction, type PermissionScope } from '@lms/shared/permission-catalog';

import type { PrismaService } from '../database/prisma.service.js';
import type { CustomRolesService } from '../modules/custom-roles/custom-roles.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

// PR 482 acceptance criteria through the real HTTP stack and Postgres: courses, longreads, tests (attempts) and course
// reports honour custom roles with their areas; the built-in roles behave as before.
const PASSWORD = 'CustomRoles1!';

type Grant = { action: string; scope: PermissionScope };

/** A grant plus everything it requires, each at the same scope when the catalog allows it. */
function withDependencies(action: string, scope: PermissionScope): Grant[] {
  const result = new Map<string, Grant>();
  const visit = (key: string, wanted: PermissionScope) => {
    if (result.has(key)) return;
    const item = findPermissionAction(key)!;
    const chosen = item.scopes.includes(wanted) ? wanted : item.scopes[item.scopes.length - 1]!;
    result.set(key, { action: key, scope: chosen });
    for (const required of item.requires) visit(required, chosen);
  };
  visit(action, scope);
  return [...result.values()];
}

describe('custom roles on course, test and report routes — database', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let roles: CustomRolesService;
  let organizationId: string;
  const emails = new Map<string, string>();

  async function createUser(label: string, role: 'learner' | 'instructor' | 'manager' = 'learner') {
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

  async function giveRole(userId: string, grants: Grant[]) {
    const role = await roles.createRole(organizationId, { name: `role-${randomUUID()}` });
    await roles.replacePermissions(organizationId, role.id, role.version, grants);
    await roles.assignRole(organizationId, userId, role.id);
    return role;
  }

  const setSwitch = (enabled: boolean) => prisma.organization.update({ where: { id: organizationId }, data: { customRolesEnabled: enabled } });
  const course = (title: string) => prisma.course.create({ data: { organizationId, title, slug: `cr-${randomUUID().slice(0, 8)}` } });
  const patchCourse = (headers: Record<string, string>, courseId: string) =>
    fetch(`${baseUrl}/api/v1/courses/${courseId}`, { method: 'PATCH', headers, body: JSON.stringify({ title: 'Renamed' }) });
  const postCourse = (headers: Record<string, string>) =>
    fetch(`${baseUrl}/api/v1/courses`, { method: 'POST', headers, body: JSON.stringify({ organizationId, title: 'Own course', slug: `cr-${randomUUID().slice(0, 8)}` }) });

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
    organizationId = (await prisma.organization.create({ data: { name: `CR learning ${runId}`, slug: `cr-learning-${runId}` } })).id;
  });

  afterAll(async () => {
    try {
      if (organizationId) {
        await prisma.assessmentAttempt.deleteMany({ where: { organizationId } });
        await prisma.assessment.deleteMany({ where: { organizationId } });
        await prisma.course.deleteMany({ where: { organizationId } });
        await prisma.user.deleteMany({ where: { organizationId } });
        await prisma.organization.deleteMany({ where: { id: organizationId } });
      }
    } finally {
      await app?.close();
    }
  });

  it('own course scope: a learner creates a course and edits only the courses of the own, the organization scope edits all', async () => {
    const author = await createUser('course-author');
    await giveRole(author, withDependencies('course.edit', 'own'));
    const headers = await headersFor(author);
    const foreign = await course('Foreign course');

    await setSwitch(false);
    expect((await postCourse(headers)).status).toBe(403);

    await setSwitch(true);
    const created = await postCourse(headers);
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id?: string; data?: { id: string } };
    const ownId = body.id ?? body.data!.id;
    expect((await patchCourse(headers, ownId)).status).toBe(200);
    expect((await patchCourse(headers, foreign.id)).status).toBe(404);

    const manager = await createUser('course-org-editor');
    await giveRole(manager, withDependencies('course.edit', 'organization'));
    expect((await patchCourse(await headersFor(manager), foreign.id)).status).toBe(200);
  });

  it('a longread author does not edit courses, and tests need their own right', async () => {
    const author = await createUser('longread-author');
    await giveRole(author, withDependencies('longread.edit', 'organization'));
    const headers = await headersFor(author);
    const target = await course('Target course');
    await setSwitch(true);

    expect((await patchCourse(headers, target.id)).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/v1/assessments`, { method: 'POST', headers, body: JSON.stringify({ organizationId, courseId: target.id, title: 'Quiz', slug: 'quiz-1' }) })).status).toBe(403);
  });

  it('attempts: own shows only the own attempts, the organization all of them, a team grant only the team', async () => {
    const owner = await createUser('attempt-owner');
    const other = await createUser('attempt-other');
    const target = await course('Quiz course');
    const assessment = await prisma.assessment.create({ data: { organizationId, courseId: target.id, title: 'Quiz', slug: `quiz-${randomUUID().slice(0, 8)}`, status: 'published' } });
    const mine = await prisma.assessmentAttempt.create({ data: { organizationId, assessmentId: assessment.id, userId: owner } });
    const theirs = await prisma.assessmentAttempt.create({ data: { organizationId, assessmentId: assessment.id, userId: other } });
    await setSwitch(true);

    const ids = async (userId: string) => {
      const response = await fetch(`${baseUrl}/api/v1/assessments/${assessment.id}/attempts`, { headers: await headersFor(userId) });
      if (response.status !== 200) return response.status;
      const data = (await response.json()) as Array<{ id: string }> | { data: Array<{ id: string }> };
      return (Array.isArray(data) ? data : data.data).map((attempt) => attempt.id).sort();
    };

    expect(await ids(owner)).toBe(403);
    await giveRole(owner, withDependencies('assessment.attempt.read', 'own'));
    expect(await ids(owner)).toEqual([mine.id]);

    const lead = await createUser('attempt-lead');
    await giveRole(lead, withDependencies('assessment.attempt.read', 'organization'));
    expect(await ids(lead)).toEqual([mine.id, theirs.id].sort());

    const teamLead = await createUser('attempt-team');
    await giveRole(teamLead, withDependencies('assessment.attempt.read', 'team'));
    expect(await ids(teamLead)).toEqual([]);

    const resultReader = await createUser('result-reader');
    const resultUrl = `${baseUrl}/api/v1/attempts/${theirs.id}/result`;
    expect((await fetch(resultUrl, { headers: await headersFor(resultReader) })).status).toBe(403);
    await giveRole(resultReader, withDependencies('assessment.attempt.result.read', 'organization'));
    expect((await fetch(resultUrl, { headers: await headersFor(resultReader) })).status).toBe(200);

    const ownHeaders = await headersFor(owner);
    expect((await fetch(`${baseUrl}/api/v1/attempts/${mine.id}`, { headers: ownHeaders })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/v1/attempts/${theirs.id}`, { headers: ownHeaders })).status).toBe(404);
  });

  it('course reports: a grant opens them, the organization scope sees every course, built-in roles are unchanged', async () => {
    const reader = await createUser('report-reader');
    const plain = await createUser('report-plain');
    const mine = await course('Reported course');
    const analytics = (headers: Record<string, string>) => fetch(`${baseUrl}/api/v1/reports/course-analytics`, { headers });
    await setSwitch(true);

    expect((await analytics(await headersFor(plain))).status).toBe(403);
    await giveRole(reader, withDependencies('report.course.read', 'organization'));
    const response = await analytics(await headersFor(reader));
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).toContain(mine.id);
    // Not granted: the summary report, the administrator dashboard and role-bound data changes.
    expect((await fetch(`${baseUrl}/api/v1/reports/admin-dashboard`, { headers: await headersFor(reader) })).status).toBe(403);
    expect((await patchCourse(await headersFor(reader), mine.id)).status).toBe(403);

    const instructor = await createUser('report-instructor', 'instructor');
    for (const enabled of [false, true]) {
      await setSwitch(enabled);
      expect((await analytics(await headersFor(instructor))).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/v1/reports/admin-dashboard`, { headers: await headersFor(instructor) })).status).toBe(403);
    }
  });
});
