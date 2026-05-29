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

describe('AuthController logout', () => {
  it('rejects logout without bearer token', async () => {
    const controller = new AuthController({} as AuthService);

    await expect(controller.logout(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('validates bearer token before accepting logout', async () => {
    const tokens: string[] = [];
    const authService = {
      getCurrentUser: async (accessToken: string) => {
        tokens.push(accessToken);

        return currentUser;
      },
      logout: () => ({ accepted: true }),
    } as unknown as AuthService;
    const controller = new AuthController(authService);

    const result = await controller.logout('Bearer access-token');

    expect(tokens).toEqual(['access-token']);
    expect(result).toEqual({ accepted: true });
  });
});
