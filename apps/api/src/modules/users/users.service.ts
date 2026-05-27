import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { hashPassword } from '../auth/passwords.js';
import {
  createBulkUserItemSchema,
  CreateBulkUsersInput,
  CreateUserInput,
  ImportUsersInput,
} from './users.schemas.js';

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

type ImportUserData = Omit<CreateUserInput, 'organizationId'>;
type ImportRowStatus = 'created' | 'valid' | 'skipped';

type ImportRowReport = {
  index: number;
  email: string | null;
  status: ImportRowStatus;
  userId: string | null;
  errors: string[];
};

type ImportRow = {
  index: number;
  data: ImportUserData | null;
  report: ImportRowReport;
};

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
    const existingEmails = await this.findExistingEmails(input.organizationId, [input.email]);

    if (existingEmails.size > 0) {
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

  async createBulkUsers(input: CreateBulkUsersInput) {
    await this.ensureOrganizationExists(input.organizationId);
    const emails = input.users.map((user) => user.email);
    const existingEmails = await this.findExistingEmails(input.organizationId, emails);

    if (existingEmails.size > 0) {
      throw new ConflictException('User email already exists in organization');
    }

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

  async importUsers(input: ImportUsersInput) {
    await this.ensureOrganizationExists(input.organizationId);

    const rows: ImportRow[] = input.users.map((rawUser, index) => {
      const parsed = createBulkUserItemSchema.safeParse(rawUser);

      if (!parsed.success) {
        return {
          index,
          data: null,
          report: {
            index,
            email: typeof rawUser.email === 'string' ? rawUser.email.trim().toLowerCase() : null,
            status: 'skipped',
            userId: null,
            errors: parsed.error.issues.map((issue) => issue.message),
          },
        };
      }

      return {
        index,
        data: parsed.data,
        report: {
          index,
          email: parsed.data.email,
          status: 'valid',
          userId: null,
          errors: [],
        },
      };
    });

    const emailCounts = new Map<string, number>();
    rows.forEach((row) => {
      if (row.data) {
        emailCounts.set(row.data.email, (emailCounts.get(row.data.email) ?? 0) + 1);
      }
    });

    rows.forEach((row) => {
      if (row.data && (emailCounts.get(row.data.email) ?? 0) > 1) {
        row.report.status = 'skipped';
        row.report.errors.push('Duplicate user email in import payload');
      }
    });

    const validEmails = rows
      .filter((row) => row.data && row.report.errors.length === 0)
      .map((row) => row.data!.email);
    const existingEmails = await this.findExistingEmails(input.organizationId, validEmails);

    rows.forEach((row) => {
      if (row.data && existingEmails.has(row.data.email)) {
        row.report.status = 'skipped';
        row.report.errors.push('User email already exists in organization');
      }
    });

    const creatableRows = rows.filter((row) => row.data && row.report.errors.length === 0);

    if (input.mode === 'create' && creatableRows.length > 0) {
      const usersData = await Promise.all(
        creatableRows.map(async (row) => {
          const { password, ...userData } = row.data!;
          const passwordHash = await hashPassword(password);

          return {
            ...userData,
            organizationId: input.organizationId,
            passwordHash,
          };
        }),
      );

      const users = await this.prisma.$transaction(
        usersData.map((data) =>
          this.prisma.user.create({
            data,
            select: { id: true, email: true },
          }),
        ),
      );
      const createdByEmail = new Map(users.map((user) => [user.email, user.id]));

      creatableRows.forEach((row) => {
        const userId = createdByEmail.get(row.data!.email) ?? null;
        row.report.status = 'created';
        row.report.userId = userId;
      });
    }

    const reportRows: ImportRowReport[] = rows.map((row) => row.report);
    const createdCount = reportRows.filter((row) => row.status === 'created').length;
    const errorCount = reportRows.filter((row) => row.errors.length > 0).length;
    const skippedCount = reportRows.filter((row) => row.status === 'skipped').length;

    return {
      organizationId: input.organizationId,
      mode: input.mode,
      totalRows: input.users.length,
      createdCount,
      skippedCount,
      errorCount,
      rows: reportRows,
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

  private async findExistingEmails(organizationId: string, emails: string[]) {
    if (emails.length === 0) {
      return new Set<string>();
    }

    const existingUsers = await this.prisma.user.findMany({
      where: {
        organizationId,
        email: { in: emails },
        deletedAt: null,
      },
      select: { email: true },
    });

    return new Set(existingUsers.map((user) => user.email));
  }
}
