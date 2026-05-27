import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { LoginInput } from './auth.schemas.js';
import { signJwt, verifyJwt } from './auth.tokens.js';
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

const passwordResetAccepted = {
  accepted: true,
} as const;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveUserByLoginIdentity(input: Pick<LoginInput, 'organizationId' | 'email'>) {
    const user = await this.prisma.user.findFirst({
      where: {
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

    return user;
  }

  async validateLogin(input: LoginInput) {
    const user = await this.prisma.user.findFirst({
      where: {
        organizationId: input.organizationId,
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

    return {
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
    };
  }

  requestPasswordReset() {
    return passwordResetAccepted;
  }

  confirmPasswordReset() {
    return passwordResetAccepted;
  }

  async login(input: LoginInput) {
    const user = await this.validateLogin(input);

    return {
      accessToken: signJwt({
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
      const claims = verifyJwt(accessToken);

      return this.findActiveUserByLoginIdentity({
        organizationId: claims.organizationId,
        email: claims.email,
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
