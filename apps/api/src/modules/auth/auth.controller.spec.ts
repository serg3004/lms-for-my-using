import { jest } from '@jest/globals';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

import {
  accessTokenCookieName,
  csrfHeaderName,
  csrfTokenCookieName,
} from './auth.cookies';
import type { AuthCookieResponse } from './auth.cookies';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

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
};

type CookieCall = [name: string, value: string, options: Record<string, unknown>];
type ClearCookieCall = [name: string, options: Record<string, unknown>];

function createAuthService() {
  const getCurrentUserTokens: string[] = [];
  const logoutTokens: string[] = [];
  const authService = {
    getCurrentUser: async (accessToken: string) => {
      getCurrentUserTokens.push(accessToken);

      return currentUser;
    },
    login: async () => ({
      accessToken: 'login-token',
      tokenType: 'Bearer',
      user: currentUser,
    }),
    logout: async (accessToken: string) => {
      logoutTokens.push(accessToken);

      return { accepted: true };
    },
  } as unknown as AuthService;

  return {
    authService,
    getTokens: () => getCurrentUserTokens,
    getLogoutTokens: () => logoutTokens,
  };
}

function createResponse() {
  const cookieCalls: CookieCall[] = [];
  const clearCookieCalls: ClearCookieCall[] = [];
  const response = {
    cookie: (name: string, value: string, options: Record<string, unknown>) => {
      cookieCalls.push([name, value, options]);
    },
    clearCookie: (name: string, options: Record<string, unknown>) => {
      clearCookieCalls.push([name, options]);
    },
  } satisfies AuthCookieResponse;

  return {
    response,
    cookieCalls,
    clearCookieCalls,
  };
}

describe('AuthController login', () => {
  it('sets httpOnly access cookie and csrf cookie on login', async () => {
    const { authService } = createAuthService();
    const controller = new AuthController(authService);
    const { response, cookieCalls } = createResponse();

    const result = await controller.login(
      {
        organizationId: '11111111-1111-1111-1111-111111111111',
        email: 'USER@example.com',
        password: 'password',
      },
      { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0' }, ip: '203.0.113.7' },
      response,
    );

    expect(result).toMatchObject({
      accessToken: 'login-token',
      tokenType: 'Bearer',
      user: currentUser,
    });
    expect(result.csrfToken).toHaveLength(64);
    expect(cookieCalls).toContainEqual([
      accessTokenCookieName,
      'login-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
      }),
    ]);
    expect(cookieCalls).toContainEqual([
      csrfTokenCookieName,
      result.csrfToken,
      expect.objectContaining({
        httpOnly: false,
        sameSite: 'lax',
        secure: false,
      }),
    ]);
  });
  it('does not expose refreshToken in login response body', async () => {
    const authServiceWithToken = {
      login: async () => ({
        accessToken: 'login-token',
        refreshToken: 'secret-refresh-value',
        tokenType: 'Bearer',
        user: currentUser,
      }),
    } as unknown as AuthService;
    const controller = new AuthController(authServiceWithToken);
    const { response } = createResponse();

    const result = await controller.login(
      { organizationId: 'org-id', email: 'user@test.com', password: 'pass' },
      { headers: {} },
      response,
    );

    expect(result).not.toHaveProperty('refreshToken');
  });
});

describe('AuthController logout', () => {
  it('rejects logout without bearer token', async () => {
    const controller = new AuthController({} as AuthService);

    await expect(controller.logout({ headers: {}, method: 'POST' }, createResponse().response)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects logout with empty bearer token', async () => {
    const controller = new AuthController({} as AuthService);

    await expect(
      controller.logout({ headers: { authorization: 'Bearer ' }, method: 'POST' }, createResponse().response),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('trims bearer token before validating logout', async () => {
    const { authService, getLogoutTokens } = createAuthService();
    const controller = new AuthController(authService);

    await expect(
      controller.logout({ headers: { authorization: 'Bearer   access-token   ' }, method: 'POST' }, createResponse().response),
    ).resolves.toEqual({ accepted: true });

    expect(getLogoutTokens()).toEqual(['access-token']);
  });

  it('passes token to logout and clears cookies', async () => {
    const { authService, getLogoutTokens } = createAuthService();
    const controller = new AuthController(authService);
    const { response, clearCookieCalls } = createResponse();

    const result = await controller.logout(
      { headers: { authorization: 'Bearer access-token' }, method: 'POST' },
      response,
    );

    expect(getLogoutTokens()).toEqual(['access-token']);
    expect(clearCookieCalls).toHaveLength(3);
    expect(result).toEqual({ accepted: true });
  });

  it('rejects logout with an invalid authorization scheme', async () => {
    const controller = new AuthController({} as AuthService);

    await expect(
      controller.logout({ headers: { authorization: 'Basic access-token' }, method: 'POST' }, createResponse().response),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects cookie-based logout without CSRF header', async () => {
    const controller = new AuthController({} as AuthService);

    await expect(
      controller.logout(
        {
          headers: { cookie: `${accessTokenCookieName}=cookie-token; ${csrfTokenCookieName}=csrf-value` },
          method: 'POST',
        },
        createResponse().response,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts cookie-based logout with valid CSRF header', async () => {
    const { authService, getLogoutTokens } = createAuthService();
    const controller = new AuthController(authService);
    const { response, clearCookieCalls } = createResponse();
    const csrfToken = 'csrf-token-value';

    const result = await controller.logout(
      {
        headers: {
          cookie: `${accessTokenCookieName}=cookie-token; ${csrfTokenCookieName}=${csrfToken}`,
          [csrfHeaderName]: csrfToken,
        },
        method: 'POST',
      },
      response,
    );

    expect(getLogoutTokens()).toEqual(['cookie-token']);
    expect(clearCookieCalls).toHaveLength(3);
    expect(result).toEqual({ accepted: true });
  });
});

describe('AuthController getCurrentUser', () => {
  it('returns current user for valid bearer token', async () => {
    const { authService, getTokens } = createAuthService();
    const controller = new AuthController(authService);

    const result = await controller.getCurrentUser({ headers: { authorization: 'Bearer access-token' } });

    expect(result).toEqual(currentUser);
    expect(getTokens()).toEqual(['access-token']);
  });

  it('throws UnauthorizedException for GET /auth/me without authorization', () => {
    const controller = new AuthController({} as AuthService);

    expect(() => controller.getCurrentUser({ headers: {} })).toThrow(UnauthorizedException);
  });

  it('returns current user when authenticated via cookie', async () => {
    const { authService, getTokens } = createAuthService();
    const controller = new AuthController(authService);

    const result = await controller.getCurrentUser({
      headers: { cookie: `${accessTokenCookieName}=cookie-token` },
    });

    expect(result).toEqual(currentUser);
    expect(getTokens()).toEqual(['cookie-token']);
  });
});

describe('AuthController sessions (PR 494)', () => {
  const bearer = { headers: { authorization: 'Bearer access-token', 'x-csrf-token': 'x' } };

  it('passes the browser and the address of the sign-in to the service', async () => {
    const login = jest.fn(async () => ({ accessToken: 'login-token', refreshToken: 'r', tokenType: 'Bearer', user: currentUser }));
    const controller = new AuthController({ login } as unknown as AuthService);
    const { response } = createResponse();

    await controller.login(
      { organizationId: '11111111-1111-1111-1111-111111111111', email: 'user@example.com', password: 'password' },
      { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0' }, ip: '203.0.113.7' },
      response,
    );

    expect(login).toHaveBeenCalledWith(expect.anything(), { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0', ip: '203.0.113.7' });
  });

  it('lists the own sessions for the access token of the request', async () => {
    const listOwnSessions = jest.fn(async () => [{ id: 's1', current: true }]);
    const controller = new AuthController({ listOwnSessions } as unknown as AuthService);

    await expect(controller.listOwnSessions(bearer)).resolves.toEqual([{ id: 's1', current: true }]);
    expect(listOwnSessions).toHaveBeenCalledWith('access-token');
  });

  it('ends one session by id for the access token of the request', async () => {
    const revokeOwnSession = jest.fn(async () => ({ revoked: true }));
    const controller = new AuthController({ revokeOwnSession } as unknown as AuthService);

    await expect(controller.revokeOwnSession({ headers: { authorization: 'Bearer access-token' }, method: 'DELETE' }, 's2')).resolves.toEqual({ revoked: true });
    expect(revokeOwnSession).toHaveBeenCalledWith('access-token', 's2');
  });
});

