/// <reference types="jest" />

import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service.js';
import { assertSafeTestDatabase } from './database-test-safety.js';

const TEST_JWT_SECRET = 'database-smoke-jwt-secret-32-characters';
const TEST_PASSWORD = 'DatabaseSmoke1!';
const REFRESH_TOKEN_COOKIE_NAME = 'lms_refresh_token';
const CONCURRENCY_ITERATIONS = 20;

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

function getResponseCookie(response: Response, cookieName: string): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookieValues = headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? ''];
  const matchingCookie = setCookieValues
    .flatMap((value) => value.split(new RegExp(`,\\s*(?=${cookieName}=)`)))
    .find((value) => value.startsWith(`${cookieName}=`));
  const match = matchingCookie?.match(new RegExp(`^${cookieName}=([^;]+)`));

  if (!match?.[1]) {
    throw new Error(`Response did not set the ${cookieName} cookie`);
  }

  return match[1];
}

describe('API database smoke', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string | undefined;
  let userId: string | undefined;
  let userEmail: string;

  async function loginUser() {
    return fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        organizationId,
        email: userEmail,
        password: TEST_PASSWORD,
      }),
    });
  }

  function refreshSession(refreshToken: string) {
    return fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { cookie: `${REFRESH_TOKEN_COOKIE_NAME}=${refreshToken}` },
    });
  }

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
    if (userId) {
      await prisma.user.delete({ where: { id: userId } });
    }

    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } });
    }

    await app?.close();
  });

  it('serves health, authenticates a real user, and returns the current user', async () => {
    const healthResponse = await fetch(`${baseUrl}/api/v1/health`);
    expect(healthResponse.status).toBe(200);
    expect(unwrapResponse(await readJson<{ status: string; db: string }>(healthResponse))).toEqual({
      status: 'ok',
      db: 'ok',
    });

    const loginResponse = await loginUser();

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

  it('allows exactly one concurrent refresh request to consume a refresh token', async () => {
    for (let iteration = 0; iteration < CONCURRENCY_ITERATIONS; iteration += 1) {
      const sessionsBeforeLogin = await prisma.session.count({ where: { userId } });
      const loginResponse = await loginUser();

      expect([200, 201]).toContain(loginResponse.status);
      const refreshToken = getResponseCookie(loginResponse, REFRESH_TOKEN_COOKIE_NAME);
      expect(await prisma.session.count({ where: { userId } })).toBe(sessionsBeforeLogin + 1);

      const responses = await Promise.all([refreshSession(refreshToken), refreshSession(refreshToken)]);
      expect(responses.filter((response) => response.ok)).toHaveLength(1);
      expect(responses.filter((response) => response.status === 401)).toHaveLength(1);
      expect(await prisma.session.count({ where: { userId } })).toBe(sessionsBeforeLogin + 1);

      const successfulResponse = responses.find((response) => response.ok);
      expect(successfulResponse).toBeDefined();
      expect(getResponseCookie(successfulResponse!, REFRESH_TOKEN_COOKIE_NAME)).not.toBe(refreshToken);

      const reusedTokenResponse = await refreshSession(refreshToken);
      expect(reusedTokenResponse.status).toBe(401);
    }
  });
});
