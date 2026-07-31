/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

const TEST_JWT_SECRET = 'database-smoke-jwt-secret-32-characters';
const TEST_PASSWORD = 'DatabaseSmoke1!';
const REFRESH_TOKEN_COOKIE_NAME = 'lms_refresh_token';
const CONCURRENCY_ATTEMPTS = 20;

type LoginResponse = {
  accessToken: string;
  user: {
    email: string;
    roles: string[];
  };
};

type ApiEnvelope<T extends object> = T | { data: T };

function unwrapResponse<T extends object>(body: ApiEnvelope<T>): T {
  return 'data' in body ? body.data : body;
}

async function readJson<T extends object>(response: Response): Promise<ApiEnvelope<T>> {
  return (await response.json()) as ApiEnvelope<T>;
}

function getSetCookies(headers: Headers): string[] {
  const headersWithGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = headersWithGetSetCookie.getSetCookie?.();

  if (setCookies?.length) {
    return setCookies;
  }

  const combinedHeader = headers.get('set-cookie');
  return combinedHeader?.split(/,(?=\s*[^;,=\s]+=[^;,]*)/) ?? [];
}

function getCookie(response: Response, name: string): string | undefined {
  for (const setCookie of getSetCookies(response.headers)) {
    const cookiePair = setCookie.split(';', 1)[0]?.trim();
    const separatorIndex = cookiePair?.indexOf('=') ?? -1;

    if (separatorIndex > 0 && cookiePair?.slice(0, separatorIndex) === name) {
      return cookiePair.slice(separatorIndex + 1);
    }
  }

  return undefined;
}

function refreshRequest(baseUrl: string, refreshToken: string) {
  return fetch(`${baseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { cookie: `${REFRESH_TOKEN_COOKIE_NAME}=${refreshToken}` },
  });
}

describe('API database smoke', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string | undefined;
  const additionalOrganizationIds: string[] = [];
  let userId: string | undefined;
  let userEmail: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL, {
      allowExternalHost: process.env.ALLOW_EXTERNAL_TEST_DATABASE === 'true',
    });

    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? TEST_JWT_SECRET;

    const [{ Test }, { AppModule }, { PrismaService }, { hashPassword }] = await Promise.all([
      import('@nestjs/testing'),
      import('../app.module.js'),
      import('../database/prisma.service.js'),
      import('../modules/auth/passwords.js'),
    ]);

    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = testingModule.createNestApplication();
    app.setGlobalPrefix('api/v1');

    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    prisma = app.get(PrismaService);

    const runId = randomUUID();
    const organization = await prisma.organization.create({
      data: {
        name: `Database Smoke ${runId}`,
        slug: `database-smoke-${runId}`,
      },
    });
    organizationId = organization.id;

    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        email: `database-smoke-${runId}@example.test`,
        passwordHash: await hashPassword(TEST_PASSWORD),
        firstName: 'Database',
        lastName: 'Smoke',
      },
    });
    userId = user.id;
    userEmail = user.email;

    await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: 'admin',
      },
    });
  });

  afterAll(async () => {
    try {
      for (const tenantId of [organizationId, ...additionalOrganizationIds].filter((id): id is string => Boolean(id))) {
        await prisma.progress.deleteMany({ where: { organizationId: tenantId } });
        await prisma.assignment.deleteMany({ where: { organizationId: tenantId } });
        // Tests may create additional users (for example, an instructor). Remove
        // every tenant user rather than only the bootstrap admin so the
        // Organization -> User RESTRICT relation cannot leave teardown data.
        await prisma.user.deleteMany({ where: { organizationId: tenantId } });
      }
    } finally {
      try {
        await prisma.organization.deleteMany({
          where: { id: { in: [organizationId, ...additionalOrganizationIds].filter((id): id is string => Boolean(id)) } },
        });
      } finally {
        await app?.close();
      }
    }
  });

  it('serves health, authenticates a real user, and returns the current user', async () => {
    const healthResponse = await fetch(`${baseUrl}/api/v1/health`);
    expect(healthResponse.status).toBe(200);
    expect(unwrapResponse(await readJson<{ status: string; db: string }>(healthResponse))).toEqual({
      status: 'ok',
      db: 'ok',
    });

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        organizationId,
        email: userEmail,
        password: TEST_PASSWORD,
      }),
    });

    expect([200, 201]).toContain(loginResponse.status);
    const login = unwrapResponse(await readJson<LoginResponse>(loginResponse));
    expect(login.accessToken).toEqual(expect.any(String));
    expect(login.user.roles).toContain('admin');

    const currentUserResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${login.accessToken}` },
    });

    expect(currentUserResponse.status).toBe(200);
    const currentUser = unwrapResponse(await readJson<LoginResponse['user']>(currentUserResponse));
    expect(currentUser.email).toBe(login.user.email);
    expect(currentUser.roles).toContain('admin');
  });

  it('rejects a protected request without an access token', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/me`);

    expect(response.status).toBe(401);
    const body = JSON.stringify(await response.json());
    expect(body).not.toMatch(/stack|SELECT|node_modules/i);
  });

  it('enforces instructor ownership with real course assignments', async () => {
    const passwordOwner = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const instructor = await prisma.user.create({
      data: {
        organizationId: organizationId!,
        email: `instructor-${randomUUID()}@example.test`,
        passwordHash: passwordOwner.passwordHash,
        firstName: 'Course',
        lastName: 'Instructor',
        memberships: { create: { organizationId: organizationId!, role: 'instructor' } },
      },
    });
    const [ownedCourse, foreignCourse] = await Promise.all([
      prisma.course.create({
        data: { organizationId: organizationId!, title: 'Owned course', slug: `owned-${randomUUID()}` },
      }),
      prisma.course.create({
        data: { organizationId: organizationId!, title: 'Foreign course', slug: `foreign-${randomUUID()}` },
      }),
    ]);
    await prisma.courseInstructor.create({
      data: { organizationId: organizationId!, instructorId: instructor.id, courseId: ownedCourse.id },
    });

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId, email: instructor.email, password: TEST_PASSWORD }),
    });
    const login = unwrapResponse(await readJson<LoginResponse>(loginResponse));
    const headers = { authorization: `Bearer ${login.accessToken}` };

    const listResponse = await fetch(`${baseUrl}/api/v1/courses`, { headers });
    const list = unwrapResponse(await readJson<{ items: Array<{ id: string }> }>(listResponse));
    expect(list.items.map((course) => course.id)).toContain(ownedCourse.id);
    expect(list.items.map((course) => course.id)).not.toContain(foreignCourse.id);

    expect((await fetch(`${baseUrl}/api/v1/courses/${ownedCourse.id}`, { headers })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/v1/courses/${foreignCourse.id}`, { headers })).status).toBe(404);

    const createResponse = await fetch(`${baseUrl}/api/v1/courses`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId, title: 'Instructor-created', slug: `created-${randomUUID()}` }),
    });
    expect(createResponse.status).toBe(201);
    const created = unwrapResponse(await readJson<{ id: string }>(createResponse));
    await expect(prisma.courseInstructor.findUnique({
      where: { courseId_instructorId: { courseId: created.id, instructorId: instructor.id } },
    })).resolves.not.toBeNull();
  });

  it('enforces manager scope across multiple teams and tenants while leaving admins unrestricted', async () => {
    const passwordOwner = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const createUser = (label: string, tenantId = organizationId!) => prisma.user.create({
      data: {
        organizationId: tenantId,
        email: `${label}-${randomUUID()}@example.test`,
        passwordHash: passwordOwner.passwordHash,
        firstName: label,
        lastName: 'Manager scope',
      },
    });
    const [manager, firstTeamUser, secondTeamUser, sameTenantOutsider] = await Promise.all([
      createUser('manager'),
      createUser('first-team'),
      createUser('second-team'),
      createUser('outsider'),
    ]);
    await prisma.membership.create({
      data: { organizationId: organizationId!, userId: manager.id, role: 'manager' },
    });

    const [firstGroup, secondGroup, outsiderGroup, course] = await Promise.all([
      prisma.group.create({ data: { organizationId: organizationId!, name: 'First team', slug: `first-${randomUUID()}` } }),
      prisma.group.create({ data: { organizationId: organizationId!, name: 'Second team', slug: `second-${randomUUID()}` } }),
      prisma.group.create({ data: { organizationId: organizationId!, name: 'Other team', slug: `other-${randomUUID()}` } }),
      prisma.course.create({ data: { organizationId: organizationId!, title: 'Manager scope', slug: `scope-${randomUUID()}` } }),
    ]);
    await Promise.all([
      prisma.managerGroup.create({ data: { organizationId: organizationId!, managerId: manager.id, groupId: firstGroup.id } }),
      prisma.managerGroup.create({ data: { organizationId: organizationId!, managerId: manager.id, groupId: secondGroup.id } }),
      prisma.groupMember.create({ data: { organizationId: organizationId!, groupId: firstGroup.id, userId: firstTeamUser.id } }),
      prisma.groupMember.create({ data: { organizationId: organizationId!, groupId: secondGroup.id, userId: secondTeamUser.id } }),
      prisma.groupMember.create({ data: { organizationId: organizationId!, groupId: outsiderGroup.id, userId: sameTenantOutsider.id } }),
    ]);
    const [teamAssignment, groupAssignment, outsiderAssignment, teamProgress, outsiderProgress] = await Promise.all([
      prisma.assignment.create({ data: { organizationId: organizationId!, courseId: course.id, userId: firstTeamUser.id } }),
      prisma.assignment.create({ data: { organizationId: organizationId!, courseId: course.id, groupId: secondGroup.id } }),
      prisma.assignment.create({ data: { organizationId: organizationId!, courseId: course.id, userId: sameTenantOutsider.id } }),
      prisma.progress.create({ data: { organizationId: organizationId!, courseId: course.id, userId: secondTeamUser.id } }),
      prisma.progress.create({ data: { organizationId: organizationId!, courseId: course.id, userId: sameTenantOutsider.id } }),
    ]);

    const foreignOrganization = await prisma.organization.create({
      data: { name: 'Foreign manager scope', slug: `foreign-scope-${randomUUID()}` },
    });
    additionalOrganizationIds.push(foreignOrganization.id);
    const foreignUser = await createUser('foreign', foreignOrganization.id);

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId, email: manager.email, password: TEST_PASSWORD }),
    });
    expect(loginResponse.ok).toBe(true);
    const login = unwrapResponse(await readJson<LoginResponse>(loginResponse));
    const managerHeaders = { authorization: `Bearer ${login.accessToken}` };

    const usersResponse = await fetch(`${baseUrl}/api/v1/users?pageSize=100`, { headers: managerHeaders });
    const users = unwrapResponse(await readJson<{ items: Array<{ id: string }> }>(usersResponse));
    expect(users.items.map(({ id }) => id)).toEqual(expect.arrayContaining([firstTeamUser.id, secondTeamUser.id]));
    expect(users.items.map(({ id }) => id)).not.toEqual(expect.arrayContaining([sameTenantOutsider.id, foreignUser.id]));
    expect((await fetch(`${baseUrl}/api/v1/users/${sameTenantOutsider.id}`, { headers: managerHeaders })).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/v1/users/${foreignUser.id}`, { headers: managerHeaders })).status).toBe(404);

    const assignmentsResponse = await fetch(`${baseUrl}/api/v1/assignments?pageSize=100`, { headers: managerHeaders });
    const assignments = unwrapResponse(await readJson<{ items: Array<{ id: string }> }>(assignmentsResponse));
    expect(assignments.items.map(({ id }) => id)).toEqual(expect.arrayContaining([teamAssignment.id, groupAssignment.id]));
    expect(assignments.items.map(({ id }) => id)).not.toContain(outsiderAssignment.id);

    const progressResponse = await fetch(`${baseUrl}/api/v1/progress?pageSize=100`, { headers: managerHeaders });
    const progress = unwrapResponse(await readJson<{ items: Array<{ id: string }> }>(progressResponse));
    expect(progress.items.map(({ id }) => id)).toContain(teamProgress.id);
    expect(progress.items.map(({ id }) => id)).not.toContain(outsiderProgress.id);

    const adminLoginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId, email: userEmail, password: TEST_PASSWORD }),
    });
    const adminLogin = unwrapResponse(await readJson<LoginResponse>(adminLoginResponse));
    const adminUsersResponse = await fetch(`${baseUrl}/api/v1/users?pageSize=100`, {
      headers: { authorization: `Bearer ${adminLogin.accessToken}` },
    });
    const adminUsers = unwrapResponse(await readJson<{ items: Array<{ id: string }> }>(adminUsersResponse));
    expect(adminUsers.items.map(({ id }) => id)).toEqual(expect.arrayContaining([
      firstTeamUser.id,
      secondTeamUser.id,
      sameTenantOutsider.id,
    ]));
    expect(adminUsers.items.map(({ id }) => id)).not.toContain(foreignUser.id);
  });

  it('atomically rotates a refresh token under concurrent requests', async () => {
    for (let attempt = 0; attempt < CONCURRENCY_ATTEMPTS; attempt += 1) {
      const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          email: userEmail,
          password: TEST_PASSWORD,
        }),
      });

      expect(loginResponse.ok).toBe(true);
      const originalRefreshToken = getCookie(loginResponse, REFRESH_TOKEN_COOKIE_NAME);
      expect(originalRefreshToken).toEqual(expect.any(String));

      const sessionCountBeforeRefresh = await prisma.session.count({ where: { userId } });
      const responses = await Promise.all([
        refreshRequest(baseUrl, originalRefreshToken!),
        refreshRequest(baseUrl, originalRefreshToken!),
      ]);

      const successfulResponses = responses.filter((response) => response.ok);
      const unauthorizedResponses = responses.filter((response) => response.status === 401);
      expect(successfulResponses).toHaveLength(1);
      expect(unauthorizedResponses).toHaveLength(1);
      expect(await prisma.session.count({ where: { userId } })).toBe(sessionCountBeforeRefresh);

      const rotatedRefreshToken = getCookie(successfulResponses[0]!, REFRESH_TOKEN_COOKIE_NAME);
      expect(rotatedRefreshToken).toEqual(expect.any(String));
      expect(rotatedRefreshToken).not.toBe(originalRefreshToken);

      const reusedTokenResponse = await refreshRequest(baseUrl, originalRefreshToken!);
      expect(reusedTokenResponse.status).toBe(401);
    }
  });
});
