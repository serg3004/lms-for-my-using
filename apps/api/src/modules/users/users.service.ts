import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { hashPassword } from '../auth/public.js';
import { ManagerTeamScope } from '../manager-team-scope/public.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';
import {
  createBulkUserItemSchema,
  CreateBulkUsersInput,
  CreateUserInput,
  ImportUsersInput,
  UpdateUserInput,
  UpdateUserStatusInput,
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
  memberships: {
    select: { role: true },
    orderBy: { createdAt: 'asc' as const },
  },
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
    private readonly teamScope: ManagerTeamScope = new ManagerTeamScope(),
  ) {}

  async listUsers(actor: TeamScopeActor, page: number, pageSize: number, search?: string) {
    const skip = (page - 1) * pageSize;
    const where = {
      organizationId: actor.organizationId,
      ...this.teamScope.user(actor),
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize, select: userSelect }),
      this.prisma.user.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async getUser(userId: string, actor: TeamScopeActor) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId: actor.organizationId,
        ...this.teamScope.user(actor),
        deletedAt: null,
      },
      select: userSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }


  async updateUser(userId: string, actor: TeamScopeActor, input: UpdateUserInput) {
    const organizationId = actor.organizationId;
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        ...this.teamScope.user(actor),
        deletedAt: null,
      },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (input.email !== user.email) {
      const existingEmails = await this.findExistingEmails(organizationId, [input.email]);

      if (existingEmails.size > 0) {
        throw new ConflictException('User email already exists in organization');
      }
    }

    const { role, ...userData } = input;
    const changedFields = [...Object.keys(userData), ...(role !== undefined ? ['role'] : [])];

    if (role !== undefined && role !== 'admin') {
      const holdsAdmin = await this.prisma.membership.findFirst({
        where: { organizationId, userId, role: 'admin' },
        select: { id: true },
      });

      if (holdsAdmin) {
        const remainingAdmins = await this.prisma.membership.count({
          where: { organizationId, role: 'admin', userId: { not: userId } },
        });

        if (remainingAdmins === 0) {
          throw new ConflictException('Cannot remove the last admin from the organization');
        }
      }
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId, organizationId },
        data: userData,
        select: { id: true },
      });

      if (role !== undefined) {
        await transaction.membership.deleteMany({
          where: {
            organizationId,
            userId,
          },
        });

        if (role !== null) {
          await transaction.membership.create({
            data: {
              organizationId,
              userId,
              role,
            },
          });
        }
      }

      return transaction.user.findUniqueOrThrow({
        where: { id: userId, organizationId },
        select: userSelect,
      });
    });

    await this.auditLog.record({
      organizationId,
      actorId: actor.id,
      action: 'user.updated',
      targetType: 'user',
      targetId: userId,
      summary: `Updated user ${updated.email}`,
      metadata: { fields: changedFields },
    });

    return updated;
  }

  async createUser(input: CreateUserInput, actorId: string | null = null) {
    await this.ensureOrganizationExists(input.organizationId);
    const existingEmails = await this.findExistingEmails(input.organizationId, [input.email]);

    if (existingEmails.size > 0) {
      throw new ConflictException('User email already exists in organization');
    }

    const { password, ...userData } = input;
    const passwordHash = await hashPassword(password);

    const created = await this.prisma.user.create({
      data: {
        ...userData,
        passwordHash,
      },
      select: userSelect,
    });

    await this.auditLog.record({
      organizationId: input.organizationId,
      actorId,
      action: 'user.created',
      targetType: 'user',
      targetId: created.id,
      summary: `Created user ${created.email}`,
    });

    return created;
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

  async updateUserStatus(userId: string, actor: TeamScopeActor, status: UpdateUserStatusInput['status']) {
    const organizationId = actor.organizationId;
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, ...this.teamScope.user(actor), deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId, organizationId },
      data: { status },
      select: userSelect,
    });

    const orphanedCourses = status !== 'active' ? await this.findSoleInstructorCourses(userId, organizationId) : [];

    await this.auditLog.record({
      organizationId,
      actorId: actor.id,
      action: 'user.status_changed',
      targetType: 'user',
      targetId: userId,
      summary: `Set user ${updatedUser.email} status to ${status}`,
      metadata: { status },
    });

    return { ...updatedUser, orphanedCourses };
  }

  /** Courses where userId is the only active CourseInstructor — left without an accessible owner once deactivated. */
  private async findSoleInstructorCourses(userId: string, organizationId: string) {
    const courses = await this.prisma.course.findMany({
      where: {
        organizationId,
        deletedAt: null,
        instructors: { some: { instructorId: userId, organizationId, deletedAt: null } },
      },
      select: {
        id: true,
        title: true,
        instructors: { where: { deletedAt: null }, select: { instructorId: true } },
      },
    });

    return courses
      .filter((course) => course.instructors.length === 1)
      .map((course) => ({ id: course.id, title: course.title }));
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
