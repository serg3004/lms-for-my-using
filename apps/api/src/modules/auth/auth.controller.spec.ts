import { UnauthorizedException } from '@nestjs/common';

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

describe('AuthController logout', () => {
  it('rejects logout without bearer token', async () => {
    controller = new AuthController({} as AuthService);

    await expect(controller.logout(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects logout with empty bearer token', async () => {
    controller = new AuthController({} as AuthService);

    await expect(controller.logout('Bearer ')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects logout with an invalid authorization scheme', async () => {
    const controller = new AuthController({} as AuthService);

    await expect(controller.logout('Basic access-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('validates bearer token before accepting logout', async () => {
    const { authService, getTokens, getLogoutCalls } = createAuthService();
    controller = new AuthController(authService);

    const result = await controller.logout('Bearer access-token');

    expect(getTokens()).toEqual(['access-token']);
    expect(getLogoutCalls()).toBe(1);
    expect(result).toEqual({ accepted: true });
  });

  it('trims bearer token before validating logout', async () => {
    const { authService, getTokens } = createAuthService();
    const controller = new AuthController(authService);

    await expect(controller.logout('Bearer   access-token   ')).resolves.toEqual({ accepted: true });

    expect(getTokens()).toEqual(['access-token']);
  });
});
