import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import type { PrismaService } from '../database/prisma.service.js';

const TEST_JWT_SECRET = 'database-smoke-jwt-secret-32-characters';
const TEST_PASSWORD = 'DatabaseSmoke1!';
const TEST_DATABASE_MARKER = 'test';

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

function assertSafeTestDatabase(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for the database smoke test');
  }

  const parsedUrl = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ''));

  if (!databaseName.toLowerCase().includes(TEST_DATABASE_MARKER)) {
    throw new Error('Database smoke test requires a database name containing "test"');
  }

  return databaseUrl;
}

describe('API database smoke', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let organizationId: string | undefined;
  let userId: string | undefined;
  let userEmail: string;

  beforeAll(async () => {
    assertSafeTestDatabase(process.env.DATABASE_URL);

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
});
