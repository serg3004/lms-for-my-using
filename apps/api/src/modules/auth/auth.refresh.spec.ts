import { jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';

import { AuthCookieResponse, refreshTokenCookieName } from './auth.cookies.js';
import { AuthController } from '../auth/auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthSessionStore } from './auth.session-store.js';

const fakeSession = {
  id: 'session-id-1',
  jti: 'old-jti',
  userId: 'user-id-1',
  organizationId: 'org-id-1',
  refreshTokenHash: 'hashed',
  refreshExpiresAt: new Date(Date.now() + 86_400_000),
  expiresAt: new Date(Date.now() + 3_600_000),
  createdAt: new Date(),
  revokedAt: null,
};

const fakeRefreshResult = {
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
  tokenType: 'Bearer' as const,
  user: { id: 'user-id-1', email: 'test@example.com', roles: [] },
};

function createController(options?: {
  sessionNotFound?: boolean;
  noSessionStore?: boolean;
}) {
  const authService = {
    refreshSession: jest.fn<() => Promise<typeof fakeRefreshResult>>().mockResolvedValue(fakeRefreshResult),
    login: jest.fn(),
    logout: jest.fn(),
    getCurrentUser: jest.fn(),
  } as unknown as AuthService;

  if (options?.noSessionStore) {
    return { controller: new AuthController(authService), authService };
  }

  const sessionStore = {
    findActiveRefreshSession: jest.fn<() => Promise<typeof fakeSession | null>>().mockResolvedValue(
      options?.sessionNotFound ? null : fakeSession,
    ),
    revokeAllUserSessions: jest.fn(),
  } as unknown as AuthSessionStore;

  return { controller: new AuthController(authService, sessionStore), authService, sessionStore };
}

function createResponse() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as AuthCookieResponse;
}

describe('POST /auth/refresh', () => {
  it('issues new access token and rotates refresh cookie when token is valid', async () => {
    const { controller } = createController();
    const response = createResponse();

    const result = await controller.refresh(
      { headers: { cookie: `${refreshTokenCookieName}=valid-refresh-token` } },
      response,
    );

    expect(result.accessToken).toBe('new-access-token');
    expect(result.tokenType).toBe('Bearer');
    expect(typeof result.csrfToken).toBe('string');
    expect(result.csrfToken.length).toBeGreaterThan(0);
    expect(response.cookie).toHaveBeenCalled();
  });

  it('throws 401 when refresh token cookie is missing', async () => {
    const { controller } = createController();

    await expect(
      controller.refresh({ headers: { cookie: '' } }, createResponse()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws 401 and clears cookies when session not found or expired', async () => {
    const { controller } = createController({ sessionNotFound: true });
    const response = createResponse();

    await expect(
      controller.refresh(
        { headers: { cookie: `${refreshTokenCookieName}=stale-token` } },
        response,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(response.clearCookie).toHaveBeenCalled();
  });

  it('throws 401 when session store is unavailable', async () => {
    const { controller } = createController({ noSessionStore: true });

    await expect(
      controller.refresh(
        { headers: { cookie: `${refreshTokenCookieName}=some-token` } },
        createResponse(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('calls refreshSession with correct session identifiers', async () => {
    const { controller, authService } = createController();

    await controller.refresh(
      { headers: { cookie: `${refreshTokenCookieName}=valid-token` } },
      createResponse(),
    );

    expect(authService.refreshSession).toHaveBeenCalledWith(
      fakeSession.id,
      fakeSession.userId,
      fakeSession.organizationId,
    );
  });
});
