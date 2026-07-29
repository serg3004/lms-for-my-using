import { PrismaService } from '../../database/prisma.service.js';
import { createRefreshToken, hashRefreshToken } from './auth.refresh-tokens.js';
import { AuthSessionStore } from './auth.session-store.js';

describe('refresh token storage', () => {
  it('creates a token and stores only a deterministic hash', () => {
    const refreshToken = createRefreshToken();

    expect(refreshToken.token).toBeTruthy();
    expect(refreshToken.hash).toBe(hashRefreshToken(refreshToken.token));
    expect(refreshToken.hash).not.toBe(refreshToken.token);
  });
});

describe('AuthSessionStore.consumeRefreshSession', () => {
  const activeSession = {
    id: 'session-id',
    userId: 'user-id',
    organizationId: 'org-id',
    refreshExpiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
  };

  it('atomically clears refreshTokenHash and returns session when token is valid', async () => {
    const updateCalls: unknown[] = [];
    const prisma = {
      session: {
        update: async (args: unknown) => {
          updateCalls.push(args);
          return activeSession;
        },
      },
    } as unknown as PrismaService;
    const store = new AuthSessionStore(prisma);

    const result = await store.consumeRefreshSession('plain-token');

    expect(result).toEqual(activeSession);
    expect(updateCalls[0]).toMatchObject({
      where: { refreshTokenHash: hashRefreshToken('plain-token') },
      data: { refreshTokenHash: null },
    });
    expect(updateCalls[0]).not.toMatchObject({ where: { refreshTokenHash: 'plain-token' } });
  });

  it('returns null when token does not exist in DB', async () => {
    const prisma = {
      session: { update: async () => { throw new Error('Record not found'); } },
    } as unknown as PrismaService;
    const store = new AuthSessionStore(prisma);

    await expect(store.consumeRefreshSession('unknown-token')).resolves.toBeNull();
  });

  it('returns null when session is expired', async () => {
    const prisma = {
      session: {
        update: async () => ({ ...activeSession, refreshExpiresAt: new Date(Date.now() - 1000) }),
      },
    } as unknown as PrismaService;
    const store = new AuthSessionStore(prisma);

    await expect(store.consumeRefreshSession('expired-token')).resolves.toBeNull();
  });

  it('returns null when session is revoked', async () => {
    const prisma = {
      session: {
        update: async () => ({ ...activeSession, revokedAt: new Date() }),
      },
    } as unknown as PrismaService;
    const store = new AuthSessionStore(prisma);

    await expect(store.consumeRefreshSession('revoked-token')).resolves.toBeNull();
  });

  it('revokes all sessions for a given user', async () => {
    const updateManyCalls: unknown[] = [];
    const prisma = {
      session: {
        updateMany: async (args: unknown) => {
          updateManyCalls.push(args);
          return { count: 3 };
        },
      },
    } as unknown as PrismaService;
    const store = new AuthSessionStore(prisma);

    await store.revokeAllUserSessions('user-id', 'org-id');

    expect(updateManyCalls[0]).toMatchObject({
      where: { userId: 'user-id', organizationId: 'org-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
