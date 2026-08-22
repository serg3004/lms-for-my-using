import { BadRequestException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { type CurrentUser, type LoginInput, type PasswordResetConfirmInput, type PasswordResetRequestInput, type UserRole } from './auth.schemas.js';
import { type JwtClaims, signJwt, verifyJwt } from './auth.tokens.js';
import { createRefreshToken } from './auth.refresh-tokens.js';
import { refreshTokenLifetimeMs } from './auth.lifecycle.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { createPasswordResetToken, hashPasswordResetToken, PasswordResetDelivery, passwordResetLifetimeMs } from './password-reset.js';

const currentUserSelect = {
  id: true,
  organizationId: true,
  email: true,
  firstName: true,
  lastName: true,
  middleName: true,
  position: true,
  shift: true,
  phone: true,
  status: true,
  locale: true,
  timezone: true,
} as const;

const loginUserSelect = {
  ...currentUserSelect,
  passwordHash: true,
} as const;

const logoutAccepted = {
  accepted: true,
} as const;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CurrentUserRecord = Omit<CurrentUser, 'roles'>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly passwordResetDelivery?: PasswordResetDelivery,
  ) {}

  async findActiveUserByLoginIdentity(input: Pick<LoginInput, 'organizationId' | 'email'>) {
    const organizationId = await this.resolveLoginOrganizationId(input.organizationId);

    const user = await this.prisma.user.findFirst({
      where: {
        organizationId,
        email: input.email,
        status: 'active',
        deletedAt: null,
      },
      select: currentUserSelect,
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.withRoles(user);
  }

  async findActiveUserByCurrentUserClaims(input: Pick<JwtClaims, 'sub' | 'organizationId' | 'email'>) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: input.sub,
        organizationId: input.organizationId,
        email: input.email,
        status: 'active',
        deletedAt: null,
      },
      select: currentUserSelect,
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.withRoles(user);
  }

  async validateLogin(input: LoginInput) {
    const organizationId = await this.resolveLoginOrganizationId(input.organizationId);

    const user = await this.prisma.user.findFirst({
      where: {
        organizationId,
        email: input.email,
        status: 'active',
        deletedAt: null,
      },
      select: loginUserSelect,
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await verifyPassword(input.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.withRoles({
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      middleName: user.middleName,
      position: user.position,
      shift: user.shift,
      phone: user.phone,
      status: user.status,
      locale: user.locale,
      timezone: user.timezone,
    });
  }

  async requestPasswordReset(input: PasswordResetRequestInput) {
    const user = await this.prisma.user.findFirst({
      where: { organizationId: input.organizationId, email: input.email, status: 'active', deletedAt: null },
      select: { id: true, organizationId: true, email: true },
    });

    if (user) {
      const reset = createPasswordResetToken();
      const expiresAt = new Date(Date.now() + passwordResetLifetimeMs);
      await this.prisma.$transaction([
        this.prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        }),
        this.prisma.passwordResetToken.create({
          data: { userId: user.id, organizationId: user.organizationId, tokenHash: reset.hash, expiresAt },
        }),
      ]);

      // Delivery failures are deliberately hidden so account existence cannot be inferred.
      await this.passwordResetDelivery?.send({ ...user, token: reset.token, expiresAt }).catch(() => undefined);
    }

    return logoutAccepted;
  }

  async confirmPasswordReset(input: PasswordResetConfirmInput) {
    const now = new Date();
    const tokenHash = hashPasswordResetToken(input.token);
    const passwordHash = await hashPassword(input.password);

    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, organizationId: true, expiresAt: true, usedAt: true },
    });
    if (!token || token.usedAt || token.expiresAt <= now) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new BadRequestException('Invalid or expired password reset token');

      await transaction.user.update({ where: { id: token.userId }, data: { passwordHash } });
      await transaction.session.updateMany({
        where: { userId: token.userId, organizationId: token.organizationId, revokedAt: null },
        data: { revokedAt: now },
      });
    });

    return logoutAccepted;
  }

  async logout(accessToken: string) {
    try {
      const claims = await verifyJwt(accessToken);
      await this.prisma.session.updateMany({
        where: { jti: claims.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // invalid token or session already revoked — logout is still accepted
    }
    return logoutAccepted;
  }

  async login(input: LoginInput) {
    const user = await this.validateLogin(input);
    const { token, jti, expiresAt } = await signJwt({
      sub: user.id,
      organizationId: user.organizationId,
      email: user.email,
    });
    const refresh = createRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + refreshTokenLifetimeMs);

    await this.prisma.session.create({
      data: {
        jti,
        userId: user.id,
        organizationId: user.organizationId,
        expiresAt,
        refreshTokenHash: refresh.hash,
        refreshExpiresAt,
      },
    });

    return {
      accessToken: token,
      refreshToken: refresh.token,
      tokenType: 'Bearer',
      user,
    };
  }

  async refreshSession(sessionId: string, userId: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, status: 'active', deletedAt: null },
      select: currentUserSelect,
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { token, jti, expiresAt } = await signJwt({
      sub: user.id,
      organizationId: user.organizationId,
      email: user.email,
    });

    const newRefresh = createRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + refreshTokenLifetimeMs);

    await this.prisma.session.update({
      where: { id: sessionId, userId, organizationId },
      data: { jti, expiresAt, refreshTokenHash: newRefresh.hash, refreshExpiresAt },
    });

    return {
      accessToken: token,
      refreshToken: newRefresh.token,
      tokenType: 'Bearer',
      user: await this.withRoles(user),
    };
  }

  async getCurrentUser(accessToken: string) {
    try {
      const claims = await verifyJwt(accessToken);

      await this.validateSession(claims.jti);

      return this.findActiveUserByCurrentUserClaims({
        sub: claims.sub,
        organizationId: claims.organizationId,
        email: claims.email,
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private async validateSession(jti: string) {
    const session = await this.prisma.session.findFirst({
      where: {
        jti,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      throw new Error('Session not found or expired');
    }
  }

  private async resolveLoginOrganizationId(organizationIdOrSlug: string) {
    const normalizedOrganizationIdOrSlug = organizationIdOrSlug.trim().toLowerCase();

    if (uuidPattern.test(normalizedOrganizationIdOrSlug)) {
      return normalizedOrganizationIdOrSlug;
    }

    const organization = await this.prisma.organization.findFirst({
      where: {
        slug: normalizedOrganizationIdOrSlug,
        status: 'active',
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!organization) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return organization.id;
  }

  private async withRoles(user: CurrentUserRecord): Promise<CurrentUser> {
    const memberships = await this.prisma.membership.findMany({
      where: {
        userId: user.id,
        organizationId: user.organizationId,
      },
      select: {
        role: true,
      },
      orderBy: {
        role: 'asc',
      },
    });

    return {
      ...user,
      roles: memberships.map((membership) => membership.role as UserRole),
    };
  }
}
