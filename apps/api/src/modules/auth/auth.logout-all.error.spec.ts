import { jest } from '@jest/globals';

import { AuthCookieResponse } from './auth.cookies.js';
import { AuthController } from '../auth/auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthSessionStore } from './auth.session-store.js';

describe('AuthController logout-all revocation failures', () => {
  it('propagates session-store failures instead of reporting success', async () => {
    const databaseError = new Error('Database unavailable');
    const authService = {
      getCurrentUser: async () => ({
        id: 'user-id',
        organizationId: 'organization-id',
      }),
    } as unknown as AuthService;
    const sessionStore = {
      revokeAllUserSessions: async () => {
        throw databaseError;
      },
    } as unknown as AuthSessionStore;
    const response = {
      clearCookie: jest.fn(),
    } as unknown as AuthCookieResponse;
    const controller = new AuthController(authService, sessionStore);

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
    ).rejects.toBe(databaseError);

    expect(response.clearCookie).toHaveBeenCalled();
  });
});
