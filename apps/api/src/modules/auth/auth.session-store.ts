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
}
