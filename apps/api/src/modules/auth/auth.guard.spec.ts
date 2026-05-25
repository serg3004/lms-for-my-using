import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { AuthService } from './auth.service';

const currentUser = {
  id: '22222222-2222-2222-2222-222222222222',
  organizationId: '11111111-1111-1111-1111-111111111111',
  email: 'user@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  middleName: null,
  position: 'Instructor',
  shift: 'Day',
  phone: null,
  status: 'active',
  locale: 'ru',
  timezone: 'Asia/Almaty',
} as const;

function createContext(request: AuthenticatedRequest) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  it('attaches current user for a valid bearer token', async () => {
    const authService = {
      getCurrentUser: jest.fn().mockResolvedValue(currentUser),
    } as unknown as AuthService;
    const request: AuthenticatedRequest = {
      headers: { authorization: 'Bearer token' },
    };

    const result = await new AuthGuard(authService).canActivate(createContext(request));

    expect(result).toBe(true);
    expect(authService.getCurrentUser).toHaveBeenCalledWith('token');
    expect(request.currentUser).toBe(currentUser);
  });

  it('rejects requests without bearer token', async () => {
    const authService = {
      getCurrentUser: jest.fn(),
    } as unknown as AuthService;
    const request: AuthenticatedRequest = { headers: {} };

    await expect(new AuthGuard(authService).canActivate(createContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
