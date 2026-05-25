import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { LoginIdentityInput } from './auth.schemas.js';

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

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveUserByLoginIdentity(input: LoginIdentityInput) {
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
}
