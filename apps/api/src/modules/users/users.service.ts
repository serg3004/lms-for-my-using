import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { hashPassword } from '../auth/passwords.js';
import { CreateUserInput } from './users.schemas.js';

const userSelect = {
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
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: userSelect,
    });
  }

  async getUser(userId: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
      },
      select: userSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async createUser(input: CreateUserInput) {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id: input.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: {
        organizationId_email: {
          organizationId: input.organizationId,
          email: input.email,
        },
      },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('User email already exists in organization');
    }

    const { password, ...userData } = input;
    const passwordHash = await hashPassword(password);

    return this.prisma.user.create({
      data: {
        ...userData,
        passwordHash,
      },
      select: userSelect,
    });
  }
}
