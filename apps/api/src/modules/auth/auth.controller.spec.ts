import { UnauthorizedException } from '@nestjs/common';

import {
  AuthCookieResponse,
  accessTokenCookieName,
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
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } satisfies AuthCookieResponse;
}

describe('AuthController login', () => {
  it('sets httpOnly access cookie and csrf cookie on login', async () => {
    const { authService } = createAuthService();
    const controller = new AuthController(authService);
    const response = createResponse();

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
    expect(response.cookie).toHaveBeenCalledWith(
      accessTokenCookieName,
      'login-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
      }),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      csrfTokenCookieName,
      result.csrfToken,
      expect.objectContaining({
        httpOnly: false,
        sameSite: 'lax',
        secure: true,
      }),
    );
  });
});

describe('AuthController logout', () => {
  it('rejects logout without bearer token', async () => {
    const controller = new AuthController({} as AuthService);

    await expect(controller.logout({ headers: {}, method: 'POST' }, createResponse())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects logout with empty bearer token', async () => {
    const controller = new AuthController({} as AuthService);

    await expect(
      controller.logout({ headers: { authorization: 'Bearer ' }, method: 'POST' }, createResponse()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects logout with an invalid authorization scheme', async () => {
    const controller = new AuthController({} as AuthService);

    await expect(
      controller.logout({ headers: { authorization: 'Basic access-token' }, method: 'POST' }, createResponse()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('validates bearer token before accepting logout', async () => {
    const { authService, getTokens, getLogoutCalls } = createAuthService();
    const controller = new AuthController(authService);
    const response = createResponse();

    const result = await controller.logout(
      { headers: { authorization: 'Bearer access-token' }, method: 'POST' },
      response,
    );

    expect(getTokens()).toEqual(['access-token']);
    expect(getLogoutCalls()).toBe(1);
    expect(response.clearCookie).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ accepted: true });
  });

  it('trims bearer token before validating logout', async () => {
    const { authService, getTokens } = createAuthService();
    const controller = new AuthController(authService);

    await expect(
      controller.logout({ headers: { authorization: 'Bearer   access-token   ' }, method: 'POST' }, createResponse()),
    ).resolves.toEqual({ accepted: true });

    expect(getTokens()).toEqual(['access-token']);
  });
});
