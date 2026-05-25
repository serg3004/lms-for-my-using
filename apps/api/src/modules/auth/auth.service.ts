import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { LoginInput } from './auth.schemas.js';
import { verifyPassword } from './passwords.js';

const currentUserSelect = {
  id: true,
  organizationId: true,
  email: true,
  firstName: true,
  lastName: true,
  middleName: true,
  phone: true,
  status: true,
  locale: true,
  timezone: true,
} as const;

const loginUserSelect = {
  ...currentUserSelect,
  passwordHash: true,
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

    const { passwordHash, ...currentUser } = user;

    return currentUser;
  }
}
