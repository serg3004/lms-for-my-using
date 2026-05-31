import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';

import {
  accessTokenCookieName,
  csrfHeaderName,
  csrfTokenCookieName,
} from './auth.cookies';
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

function createAuthService(tokens: string[] = []) {
  return {
    getCurrentUser: async (token: string) => {
      tokens.push(token);

      return currentUser;
    },
  } as unknown as AuthService;
}

describe('AuthGuard', () => {
  it('attaches current user for a valid bearer token', async () => {
    const tokens: string[] = [];
    const authService = createAuthService(tokens);
    const request: AuthenticatedRequest = {
      headers: { authorization: 'Bearer token' },
      method: 'GET',
    };

    const result = await new AuthGuard(authService).canActivate(createContext(request));

    expect(result).toBe(true);
    expect(tokens).toEqual(['token']);
    expect(request.currentUser).toBe(currentUser);
  });

  it('uses the first authorization header when multiple values are provided', async () => {
    const tokens: string[] = [];
    const authService = createAuthService(tokens);
    const request: AuthenticatedRequest = {
      headers: { authorization: ['Bearer first-token', 'Bearer second-token'] },
      method: 'GET',
    };

    await expect(new AuthGuard(authService).canActivate(createContext(request))).resolves.toBe(true);

    expect(tokens).toEqual(['first-token']);
    expect(request.currentUser).toBe(currentUser);
  });

  it('trims bearer tokens before validation', async () => {
    const tokens: string[] = [];
    const authService = createAuthService(tokens);
    const request: AuthenticatedRequest = {
      headers: { authorization: 'Bearer   padded-token   ' },
      method: 'GET',
    };

    await expect(new AuthGuard(authService).canActivate(createContext(request))).resolves.toBe(true);

    expect(tokens).toEqual(['padded-token']);
  });

  it('uses access token cookie for safe requests', async () => {
    const tokens: string[] = [];
    const authService = createAuthService(tokens);
    const request: AuthenticatedRequest = {
      headers: { cookie: `${accessTokenCookieName}=cookie-token` },
      method: 'GET',
    };

    await expect(new AuthGuard(authService).canActivate(createContext(request))).resolves.toBe(true);

    expect(tokens).toEqual(['cookie-token']);
    expect(request.currentUser).toBe(currentUser);
  });

  it('rejects unsafe cookie-auth requests without csrf token', async () => {
    const authService = createAuthService();
    const request: AuthenticatedRequest = {
      headers: { cookie: `${accessTokenCookieName}=cookie-token` },
      method: 'POST',
    };

    await expect(new AuthGuard(authService).canActivate(createContext(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('accepts unsafe cookie-auth requests with matching csrf token', async () => {
    const tokens: string[] = [];
    const authService = createAuthService(tokens);
    const csrfToken = 'csrf-token';
    const request: AuthenticatedRequest = {
      headers: {
        cookie: `${accessTokenCookieName}=cookie-token; ${csrfTokenCookieName}=${csrfToken}`,
        [csrfHeaderName]: csrfToken,
      },
      method: 'POST',
    };

    await expect(new AuthGuard(authService).canActivate(createContext(request))).resolves.toBe(true);

    expect(tokens).toEqual(['cookie-token']);
  });

  it.each([
    ['missing authorization header', undefined],
    ['empty authorization header', ''],
    ['bearer without token', 'Bearer '],
    ['wrong authorization scheme', 'Basic token'],
    ['lowercase bearer scheme', 'bearer token'],
  ])('rejects %s', async (_label, authorization) => {
    const tokens: string[] = [];
    const authService = createAuthService(tokens);
    const request: AuthenticatedRequest = {
      headers: { authorization },
      method: 'GET',
    };

    await expect(new AuthGuard(authService).canActivate(createContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tokens).toEqual([]);
  });
});
