import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  accessTokenCookieName,
  csrfTokenCookieName,
  refreshTokenCookieName,
} from '../modules/auth/auth.cookies.js';
import { AuthController } from '../modules/auth/auth.controller.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { AuthSessionStore } from '../modules/auth/auth.session-store.js';

type HttpTestResponse = {
  statusCode?: number;
  body: Record<string, unknown>;
  cookies: string[];
};

const currentUser = {
  id: '22222222-2222-2222-2222-222222222222',
  organizationId: '11111111-1111-1111-1111-111111111111',
  email: 'user@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  middleName: null,
  position: null,
  shift: null,
  phone: null,
  status: 'active',
  locale: 'ru',
  timezone: 'Asia/Almaty',
  roles: ['learner'],
};

const refreshSession = {
  id: 'session-id',
  userId: currentUser.id,
  organizationId: currentUser.organizationId,
};

function getAppUrl(app: INestApplication) {
  const address = app.getHttpServer().address() as AddressInfo;

  return `http://127.0.0.1:${address.port}`;
}

function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<HttpTestResponse> {
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const clientRequest = request(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload).toString(),
          ...headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8');

          resolve({
            statusCode: response.statusCode,
            body: rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {},
            cookies: response.headers['set-cookie'] ?? [],
          });
        });
      },
    );

    clientRequest.on('error', reject);
    clientRequest.write(payload);
    clientRequest.end();
  });
}

function findCookie(cookies: string[], name: string) {
  const cookie = cookies.find((candidate) => candidate.startsWith(`${name}=`));

  expect(cookie).toBeDefined();
  return cookie as string;
}

function expectCookieAttributes(
  cookie: string,
  options: { httpOnly: boolean; path: string; secure: boolean },
) {
  expect(cookie).toContain(`Path=${options.path}`);
  expect(cookie).toContain('SameSite=Lax');
  expect(cookie.includes('HttpOnly')).toBe(options.httpOnly);
  expect(cookie.includes('Secure')).toBe(options.secure);
}

function expectIssuedCookies(cookies: string[], secure: boolean) {
  expect(cookies).toHaveLength(3);

  const accessCookie = findCookie(cookies, accessTokenCookieName);
  expectCookieAttributes(accessCookie, { httpOnly: true, path: '/api/v1', secure });
  expect(accessCookie).toContain('Max-Age=900');
  expect(accessCookie).toMatch(/Expires=[^;]+/);

  const csrfCookie = findCookie(cookies, csrfTokenCookieName);
  expectCookieAttributes(csrfCookie, { httpOnly: false, path: '/', secure });
  expect(csrfCookie).toContain('Max-Age=900');
  expect(csrfCookie).toMatch(/Expires=[^;]+/);

  const refreshCookie = findCookie(cookies, refreshTokenCookieName);
  expectCookieAttributes(refreshCookie, {
    httpOnly: true,
    path: '/api/v1/auth/refresh',
    secure,
  });
  expect(refreshCookie).toContain('Max-Age=2592000');
  expect(refreshCookie).toMatch(/Expires=[^;]+/);
}

function expectClearedCookies(cookies: string[], secure: boolean) {
  expect(cookies).toHaveLength(3);

  for (const [name, httpOnly, path] of [
    [accessTokenCookieName, true, '/api/v1'],
    [csrfTokenCookieName, false, '/'],
    [refreshTokenCookieName, true, '/api/v1/auth/refresh'],
  ] as const) {
    const cookie = findCookie(cookies, name);

    expect(cookie).toMatch(new RegExp(`^${name}=;`));
    expectCookieAttributes(cookie, { httpOnly, path, secure });
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  }
}

describe.each([
  ['development', false],
  ['production', true],
] as const)('auth cookie HTTP contract in %s', (nodeEnv, secure) => {
  const originalNodeEnv = process.env.NODE_ENV;
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = nodeEnv;

    const authService = {
      login: async () => ({
        accessToken: 'login-access-token',
        refreshToken: 'login-refresh-token',
        tokenType: 'Bearer' as const,
        user: currentUser,
      }),
      refreshSession: async () => ({
        accessToken: 'rotated-access-token',
        refreshToken: 'rotated-refresh-token',
        tokenType: 'Bearer' as const,
        user: currentUser,
      }),
      logout: async () => ({ accepted: true as const }),
      getCurrentUser: async () => currentUser,
    } as unknown as AuthService;
    const sessionStore = {
      consumeRefreshSession: async () => refreshSession,
      revokeAllUserSessions: async () => ({ count: 1 }),
    } as unknown as AuthSessionStore;
    const moduleReference = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: AuthSessionStore, useValue: sessionStore },
      ],
    }).compile();

    app = moduleReference.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('sets complete cookies on login without exposing the refresh token in JSON', async () => {
    const response = await postJson(`${getAppUrl(app)}/api/v1/auth/login`, {
      organizationId: currentUser.organizationId,
      email: currentUser.email,
      password: 'password',
    });

    expect(response.statusCode).toBe(201);
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(response.body).toMatchObject({
      accessToken: 'login-access-token',
      tokenType: 'Bearer',
      user: currentUser,
    });
    expectIssuedCookies(response.cookies, secure);
  });

  it('rotates complete cookies on refresh without exposing the refresh token in JSON', async () => {
    const response = await postJson(
      `${getAppUrl(app)}/api/v1/auth/refresh`,
      {},
      { cookie: `${refreshTokenCookieName}=login-refresh-token` },
    );

    expect(response.statusCode).toBe(201);
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(response.body).toMatchObject({
      accessToken: 'rotated-access-token',
      tokenType: 'Bearer',
    });
    expectIssuedCookies(response.cookies, secure);
  });

  it.each(['logout', 'logout-all'])('clears cookies with matching attributes on %s', async (endpoint) => {
    const response = await postJson(
      `${getAppUrl(app)}/api/v1/auth/${endpoint}`,
      {},
      { authorization: 'Bearer access-token' },
    );

    expect(response.statusCode).toBe(201);
    expect(response.body).toEqual({ accepted: true });
    expectClearedCookies(response.cookies, secure);
  });
});
