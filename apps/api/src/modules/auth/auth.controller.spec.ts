import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

import {
  AuthCookieResponse,
  accessTokenCookieName,
  csrfHeaderName,
  csrfTokenCookieName,
} from './auth.cookies';
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
  const tokens: string[] = [];
  let logoutCalls = 0;
  const authService = {
    getCurrentUser: async (accessToken: string) => {
      tokens.push(accessToken);

      return currentUser;
    },
    login: async () => ({
      accessToken: 'login-token',
      tokenType: 'Bearer',
      user: currentUser,
    }),
    logout: () => {
      logoutCalls += 1;

      return { accepted: true };
    },
  } as unknown as AuthService;

  return {
    authService,
    getTokens: () => tokens,
    getLogoutCalls: () => logoutCalls,
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
    const { authService, getTokens } = createAuthService();
    const controller = new AuthController(authService);

    await expect(
      controller.logout({ headers: { authorization: 'Bearer   access-token   ' }, method: 'POST' }, createResponse().response),
    ).resolves.toEqual({ accepted: true });

    expect(getTokens()).toEqual(['access-token']);
  });

  it('validates bearer token before accepting logout', async () => {
    const { authService, getTokens, getLogoutCalls } = createAuthService();
    const controller = new AuthController(authService);
    const { response, clearCookieCalls } = createResponse();

    const result = await controller.logout(
      { headers: { authorization: 'Bearer access-token' }, method: 'POST' },
      response,
    );

    expect(getTokens()).toEqual(['access-token']);
    expect(getLogoutCalls()).toBe(1);
    expect(clearCookieCalls).toHaveLength(2);
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
    const { authService, getTokens, getLogoutCalls } = createAuthService();
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

    expect(getTokens()).toEqual(['cookie-token']);
    expect(getLogoutCalls()).toBe(1);
    expect(clearCookieCalls).toHaveLength(2);
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
