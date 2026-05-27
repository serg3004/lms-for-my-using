import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { hashPassword } from '../auth/passwords.js';
import { CreateBulkUsersInput, CreateUserInput } from './users.schemas.js';

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
    await this.ensureOrganizationExists(input.organizationId);
    await this.ensureEmailsAreAvailable(input.organizationId, [input.email]);

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

  async createBulkUsers(input: CreateBulkUsersInput) {
    await this.ensureOrganizationExists(input.organizationId);

    const emails = input.users.map((user) => user.email);
    await this.ensureEmailsAreAvailable(input.organizationId, emails);

    const usersData = await Promise.all(
      input.users.map(async (user) => {
        const { password, ...userData } = user;
        const passwordHash = await hashPassword(password);

        return {
          ...userData,
          organizationId: input.organizationId,
          passwordHash,
        };
      }),
    );

    const createOperations = usersData.map((data) =>
      this.prisma.user.create({
        data,
        select: userSelect,
      }),
    );

    const users = await this.prisma.$transaction(createOperations);

    return {
      organizationId: input.organizationId,
      requestedCount: input.users.length,
      createdCount: users.length,
      users,
    };
  }

  private async ensureOrganizationExists(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id: organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
  }

  private async ensureEmailsAreAvailable(organizationId: string, emails: string[]) {
    const existingUsers = await this.prisma.user.findMany({
      where: {
        organizationId,
        email: { in: emails },
        deletedAt: null,
      },
      select: { email: true },
    });

    if (existingUsers.length > 0) {
      throw new ConflictException('User email already exists in organization');
    }
  }
}
