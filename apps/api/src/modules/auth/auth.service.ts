import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { type CurrentUser, type LoginInput, type UserRole } from './auth.schemas.js';
import { type JwtClaims, signJwt, verifyJwt } from './auth.tokens.js';
import { verifyPassword } from './passwords.js';

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

const passwordResetUnavailableMessage = 'Password reset is not unavailable';

const logoutAccepted = {
  accepted: true,
} as const;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CurrentUserRecord = Omit<CurrentUser, 'roles'>;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

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

  requestPasswordReset() {
    throw new ServiceUnavailableException(passwordResetUnavailableMessage);
  }

  confirmPasswordReset() {
    throw new ServiceUnavailableException(passwordResetUnavailableMessage);
  }

  logout() {
    return logoutAccepted;
  }

  async login(input: LoginInput) {
    const user = await this.validateLogin(input);

    return {
      accessToken: await signJwt({
        sub: user.id,
        organizationId: user.organizationId,
        email: user.email,
      }),
      tokenType: 'Bearer',
      user,
    };
  }

  async getCurrentUser(accessToken: string) {
    try {
      const claims = await verifyJwt(accessToken);

      return this.findActiveUserByCurrentUserClaims({
        sub: claims.sub,
        organizationId: claims.organizationId,
        email: claims.email,
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
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
