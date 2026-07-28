import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { hashRefreshToken } from './auth.refresh-tokens.js';

@Injectable()
export class AuthSessionStore {
  constructor(private readonly prisma: PrismaService) {}

  findActiveRefreshSession(refreshToken: string) {
    return this.prisma.session.findFirst({
      where: {
        refreshTokenHash: hashRefreshToken(refreshToken),
        refreshExpiresAt: { gt: new Date() },
        revokedAt: null,
      },
    });
  }

  revokeCurrentSession(jti: string) {
    return this.prisma.session.updateMany({
      where: { jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  revokeAllUserSessions(userId: string, organizationId: string) {
    return this.prisma.session.updateMany({
      where: { userId, organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
