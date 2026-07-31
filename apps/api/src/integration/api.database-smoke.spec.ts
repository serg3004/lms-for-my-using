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
      if (userId) {
        await prisma.session.deleteMany({ where: { userId } });
        await prisma.user.delete({ where: { id: userId } });
      }
    } finally {
      try {
        if (organizationId) {
          await prisma.organization.delete({ where: { id: organizationId } });
        }
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
