import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';

import {
  AuthCookieResponse,
  accessTokenCookieName,
  csrfHeaderName,
  csrfTokenCookieName,
} from './auth.cookies.js';
import { AuthController } from '../auth/auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthSessionStore } from './auth.session-store.js';

describe('AuthController logout-all', () => {
  const currentUser = {
    id: 'user-id',
    organizationId: 'organization-id',
  };
  function createController(options?: { invalidToken?: boolean }) {
    const revokeCalls: unknown[] = [];
    const authService = {
      getCurrentUser: async () => {
        if (options?.invalidToken) {
          throw new Error('Invalid token');
        }
        return currentUser;
      },
    } as unknown as AuthService;
    const sessionStore = {
      revokeAllUserSessions: async (...args: unknown[]) => {
        revokeCalls.push(args);
        return { count: 2 };
      },
    } as unknown as AuthSessionStore;

    return {
      controller: new AuthController(authService, sessionStore),
      revokeCalls,
    };
  }

  function createResponse() {
    return {
      clearCookie: jest.fn(),
    } as unknown as AuthCookieResponse;
  }
  it('revokes all active sessions for the current user and organization', async () => {
    const { controller, revokeCalls } = createController();
    const response = createResponse();

    await expect(
      controller.logoutAll(
        {
          headers: {
            authorization: 'Bearer access-token',
          },
          method: 'POST',
        },
        response,
      ),
    ).resolves.toEqual({ accepted: true });
    expect(revokeCalls).toEqual([['user-id', 'organization-id']]);
    expect(response.clearCookie).toHaveBeenCalled();
  });

  it('requires CSRF for cookie-authenticated requests', async () => {
    const { controller, revokeCalls } = createController();
    await expect(
      controller.logoutAll(
        {
          headers: {
            cookie: `${accessTokenCookieName}=access-token`,
          },
          method: 'POST',
        },
        createResponse(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(revokeCalls).toHaveLength(0);
  });

  it('accepts matching CSRF for cookie-authenticated requests', async () => {
    const { controller, revokeCalls } = createController();
    const csrfToken = 'csrf-token';
    await expect(
      controller.logoutAll(
        {
          headers: {
            cookie: `${accessTokenCookieName}=access-token; ${csrfTokenCookieName}=${csrfToken}`,
            [csrfHeaderName]: csrfToken,
          },
          method: 'POST',
        },
        createResponse(),
      ),
    ).resolves.toEqual({ accepted: true });

    expect(revokeCalls).toEqual([['user-id', 'organization-id']]);
  });
  it('keeps invalid or already-revoked sessions idempotent', async () => {
    const { controller, revokeCalls } = createController({ invalidToken: true });

    await expect(
      controller.logoutAll(
        {
          headers: {
            authorization: 'Bearer invalid-token',
          },
          method: 'POST',
        },
        createResponse(),
      ),
    ).resolves.toEqual({ accepted: true });

    expect(revokeCalls).toHaveLength(0);
  });
});
