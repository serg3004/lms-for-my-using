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

  // A session row is safe to delete once nothing can use it anymore: it was explicitly revoked,
  // or its refresh window has passed (refresh always outlives the access token — see login()/
  // refreshSession() in auth.service.ts, both always set refreshExpiresAt on create). Without this,
  // expired sessions accumulate in the table forever (docs/CONCERNS.md).
  async cleanupExpired(dryRun = true, now = new Date()) {
    const where = {
      OR: [
        { revokedAt: { not: null } },
        { refreshExpiresAt: { lte: now } },
        { refreshExpiresAt: null, expiresAt: { lte: now } },
      ],
    };

    if (dryRun) {
      const count = await this.prisma.session.count({ where });
      return { dryRun, count };
    }

    const result = await this.prisma.session.deleteMany({ where });
    return { dryRun, count: result.count };
  }
}
