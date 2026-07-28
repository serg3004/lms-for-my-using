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

  it('looks up only active, non-revoked refresh sessions by token hash', async () => {
    const findFirstCalls: unknown[] = [];
    const prisma = {
      session: {
        findFirst: async (args: unknown) => {
          findFirstCalls.push(args);
          return { id: 'session-id' };
        },
      },
    } as unknown as PrismaService;
    const sessionStore = new AuthSessionStore(prisma);

    await sessionStore.findActiveRefreshSession('plain-refresh-token');

    expect(findFirstCalls[0]).toMatchObject({
      where: {
        refreshTokenHash: hashRefreshToken('plain-refresh-token'),
        refreshExpiresAt: { gt: expect.any(Date) },
        revokedAt: null,
      },
    });
    expect(findFirstCalls[0]).not.toEqual(
      expect.objectContaining({ refreshTokenHash: 'plain-refresh-token' }),
    );
  });

  it('returns null when no active refresh session exists', async () => {
    const prisma = {
      session: {
        findFirst: async () => null,
      },
    } as unknown as PrismaService;
    const sessionStore = new AuthSessionStore(prisma);

    await expect(sessionStore.findActiveRefreshSession('expired-token')).resolves.toBeNull();
  });
});
