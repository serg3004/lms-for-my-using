import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { hashRefreshToken } from './auth.refresh-tokens.js';

@Injectable()
export class AuthSessionStore {
  constructor(private readonly prisma: PrismaService) {}

  async consumeRefreshSession(refreshToken: string) {
    const hash = hashRefreshToken(refreshToken);
    try {
      const session = await this.prisma.session.update({
        where: { refreshTokenHash: hash },
        data: { refreshTokenHash: null },
        select: { id: true, userId: true, organizationId: true, refreshExpiresAt: true, revokedAt: true },
      });
      const now = new Date();
      if (session.revokedAt !== null || !session.refreshExpiresAt || session.refreshExpiresAt <= now) {
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  revokeAllUserSessions(userId: string, organizationId: string) {
    return this.prisma.session.updateMany({
      where: { userId, organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
