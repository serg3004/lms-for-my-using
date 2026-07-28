import { PrismaService } from '../../database/prisma.service.js';
import { AuthSessionStore } from './auth.session-store.js';

describe('AuthSessionStore revocation', () => {
  it('revokes all active sessions only for the current tenant user', async () => {
    const updateManyCalls: unknown[] = [];
    const prisma = {
      session: {
        updateMany: async (args: unknown) => {
          updateManyCalls.push(args);
          return { count: 2 };
        },
      },
    } as unknown as PrismaService;
    const sessionStore = new AuthSessionStore(prisma);

    await sessionStore.revokeAllUserSessions('user-id', 'organization-id');

    expect(updateManyCalls[0]).toMatchObject({
      where: {
        userId: 'user-id',
        organizationId: 'organization-id',
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });
  });
});
