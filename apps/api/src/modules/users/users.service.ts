import { randomBytes } from 'node:crypto';
import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { assertPasswordPolicy, checkPassword, describePasswordViolations } from '../../common/password-policy.js';
import { AuthService, hashPassword, loadPasswordPolicy } from '../auth/public.js';
import { countOpenObserverSessions, notifyObserverDeactivated } from '../checklists/public.js';
import { ManagerTeamScope } from '../manager-team-scope/public.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';
import { OrganizationAccessScopeService } from '../organization-access-scope/public.js';
import { assertNoRoleChange, UserRegistrarAccess, type Registrar } from './user-registrar-access.js';
import {
  createBulkUserItemSchema,
  CreateBulkUsersInput,
  CreateUserInput,
  CreateUserRequestInput,
  ImportUsersInput,
  ListUsersQuery,
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
  private readonly registrars: UserRegistrarAccess;
  private readonly invitationScope: OrganizationAccessScopeService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
    private readonly teamScope: ManagerTeamScope = new ManagerTeamScope(),
    private readonly authService?: AuthService,
  ) {
    this.registrars = new UserRegistrarAccess(prisma);
    this.invitationScope = new OrganizationAccessScopeService(prisma, teamScope);
  }

  async listUsers(actor: TeamScopeActor, page: number, pageSize: number, search?: string, status?: ListUsersQuery['status']) {
    const skip = (page - 1) * pageSize;
    const registrar = await this.registrars.resolve(actor);
    const where = {
      organizationId: actor.organizationId,
      ...this.teamScope.user(actor),
      ...this.registrars.readWhere(registrar, actor.organizationId),
      deletedAt: null,
      ...(status ? { status } : {}),
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

  async listInvitations(actor: TeamScopeActor, page: number, pageSize: number) {
    const where = {
      ...(await this.invitationScope.user(actor)),
      organizationId: actor.organizationId,
      status: 'invited' as const,
      deletedAt: null,
    };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize,
        select: {
          id: true, firstName: true, lastName: true, middleName: true, email: true,
          invitations: {
            where: { organizationId: actor.organizationId },
            orderBy: [{ createdAt: 'desc' }, { sendCount: 'desc' }, { id: 'desc' }], take: 1,
            select: { createdAt: true, sendCount: true, expiresAt: true, revokedAt: true, usedAt: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    const now = new Date();
    const items = users.map(({ invitations: [latest], ...user }) => ({
      ...user,
      sentAt: latest?.createdAt ?? null,
      sendCount: latest?.sendCount ?? 0,
      expiresAt: latest?.expiresAt ?? null,
      status: !latest ? 'unsent' : latest.revokedAt || latest.usedAt ? 'revoked' : latest.expiresAt <= now ? 'expired' : 'pending',
    }));
    return { items, page, pageSize, total };
  }

  async resendInvitation(actor: TeamScopeActor, userId: string) {
    return this.authService!.sendInvitation(userId, actor.organizationId, actor.id, await this.invitationScope.user(actor));
  }

  async resendInvitations(actor: TeamScopeActor, userIds: string[]) {
    const scope = await this.invitationScope.user(actor);
    const items = [];
    for (let start = 0; start < userIds.length; start += 5) {
      const batch = await Promise.all(userIds.slice(start, start + 5).map(async (userId) => {
        try {
          return { userId, status: 'sent', ...(await this.authService!.sendInvitation(userId, actor.organizationId, actor.id, scope)) };
        } catch (error) {
          const code = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
          const status = code === HttpStatus.NOT_FOUND ? 'notFound' : code === HttpStatus.TOO_MANY_REQUESTS ? 'rateLimited' : 'failed';
          return { userId, status };
        }
      }));
      items.push(...batch);
    }
    return { items };
  }

  async changeInvitation(actor: TeamScopeActor, userId: string, action: 'revoked' | 'extended') {
    return this.authService!.changeInvitation(userId, actor.organizationId, actor.id, await this.invitationScope.user(actor), action);
  }

  async getUser(userId: string, actor: TeamScopeActor) {
    const registrar = await this.registrars.resolve(actor);
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId: actor.organizationId,
        ...this.teamScope.user(actor),
        ...this.registrars.readWhere(registrar, actor.organizationId),
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
    const registrar = await this.registrars.resolve(actor);
    assertNoRoleChange(registrar, input.role);
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        ...this.teamScope.user(actor),
        ...this.registrars.writeWhere(registrar, actor),
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
      metadata: { fields: changedFields, ...(registrar ? { delegated: registrar.scope } : {}) },
    });

    return updated;
  }

  async createUser(input: CreateUserRequestInput, actorId: string | null = null, actor?: TeamScopeActor) {
    if (actor && actor.organizationId !== input.organizationId) throw new ForbiddenException('Organization mismatch');
    if (input.role !== undefined && !actor?.roles.includes('admin')) throw new ForbiddenException('Roles are granted by an administrator');
    await this.ensureOrganizationExists(input.organizationId);
    const registrar = await this.registrars.resolveCreation(actor);
    const departmentId = await this.resolvePlacement(registrar, input.organizationId, input.departmentId);
    const existingEmails = await this.findExistingEmails(input.organizationId, [input.email]);

    if (existingEmails.size > 0) {
      throw new ConflictException('User email already exists in organization');
    }

    const { password, ...userData } = input;
    delete userData.departmentId;
    delete userData.role;
    const invite = password === undefined;
    if (password !== undefined) assertPasswordPolicy(password, await loadPasswordPolicy(this.prisma, input.organizationId), input);
    if (invite && !this.authService) throw new ConflictException('Invitations are not available');
    // An invited user has no usable password until they accept: hash of a random secret nobody sees.
    const passwordHash = await hashPassword(password ?? randomBytes(32).toString('hex'));
    if (invite) userData.status = 'invited';

    const { created, deliverInvitation } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { ...userData, passwordHash }, select: { id: true } });
      await this.placeNewUsers(tx, input.organizationId, [user.id], departmentId, input.role ?? (registrar ? 'learner' : undefined), actorId);
      const created = await tx.user.findUniqueOrThrow({ where: { id: user.id, organizationId: input.organizationId }, select: userSelect });
      const deliverInvitation = invite ? await this.authService!.prepareInvitationFor({ ...created, organizationId: input.organizationId }, actorId, tx) : undefined;
      return { created, deliverInvitation };
    });

    await this.auditLog.record({
      organizationId: input.organizationId,
      actorId,
      action: 'user.created',
      targetType: 'user',
      targetId: created.id,
      summary: `Created user ${created.email}`,
      ...(registrar || departmentId || input.role ? { metadata: { departmentId, ...(registrar ? { delegated: registrar.scope } : {}) } } : {}),
    });

    if (!invite) return created;

    const invitation = await deliverInvitation!();
    await this.auditLog.record({
      organizationId: input.organizationId,
      actorId,
      action: 'user.invited',
      targetType: 'user',
      targetId: created.id,
      summary: `Invited user ${created.email}`,
      metadata: { delivered: invitation.delivered },
    });
    return { ...created, invitation };
  }

  async createBulkUsers(input: CreateBulkUsersInput, actor?: TeamScopeActor) {
    if (actor && actor.organizationId !== input.organizationId) throw new ForbiddenException('Organization mismatch');
    if (input.role !== undefined && !actor?.roles.includes('admin')) throw new ForbiddenException('Roles are granted by an administrator');
    await this.ensureOrganizationExists(input.organizationId);
    const registrar = await this.registrars.resolveCreation(actor);
    const departmentId = await this.resolvePlacement(registrar, input.organizationId, input.departmentId);
    const emails = input.users.map((user) => user.email);
    const existingEmails = await this.findExistingEmails(input.organizationId, emails);

    if (existingEmails.size > 0) {
      throw new ConflictException('User email already exists in organization');
    }

    const policy = await loadPasswordPolicy(this.prisma, input.organizationId);
    input.users.forEach((user) => assertPasswordPolicy(user.password, policy, user));

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

    const users = registrar || departmentId || input.role
      ? await this.createPlaced(usersData, input.organizationId, departmentId, input.role ?? (registrar ? 'learner' : undefined), actor?.id ?? null)
      : await this.prisma.$transaction(usersData.map((data) => this.prisma.user.create({ data, select: userSelect })));

    if (registrar || departmentId || input.role) {
      await this.auditLog.record({
        organizationId: input.organizationId,
        actorId: actor?.id ?? null,
        action: 'user.created',
        targetType: 'user',
        targetId: users[0]?.id ?? null,
        summary: `Created ${users.length} users in bulk`,
        metadata: { departmentId, count: users.length, ...(registrar ? { delegated: registrar.scope } : {}) },
      });
    }

    return {
      organizationId: input.organizationId,
      requestedCount: input.users.length,
      createdCount: users.length,
      users,
    };
  }

  async importUsers(input: ImportUsersInput, actor?: TeamScopeActor) {
    if (actor && actor.organizationId !== input.organizationId) throw new ForbiddenException('Organization mismatch');
    if (input.role !== undefined && !actor?.roles.includes('admin')) throw new ForbiddenException('Roles are granted by an administrator');
    await this.ensureOrganizationExists(input.organizationId);
    const registrar = await this.registrars.resolveCreation(actor);
    const departmentId = await this.resolvePlacement(registrar, input.organizationId, input.departmentId);

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

    const importPolicy = await loadPasswordPolicy(this.prisma, input.organizationId);
    rows.forEach((row) => {
      const violations = row.data ? checkPassword(row.data.password, importPolicy, row.data) : [];
      if (violations.length > 0) {
        row.report.status = 'skipped';
        row.report.errors.push(`Password: ${describePasswordViolations(violations, importPolicy)}`);
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

      const users = registrar || departmentId || input.role
        ? await this.createPlaced(usersData, input.organizationId, departmentId, input.role ?? (registrar ? 'learner' : undefined), actor?.id ?? null)
        : await this.prisma.$transaction(
            usersData.map((data) => this.prisma.user.create({ data, select: { id: true, email: true } })),
          );
      if (registrar || departmentId || input.role) {
        await this.auditLog.record({
          organizationId: input.organizationId,
          actorId: actor?.id ?? null,
          action: 'user.created',
          targetType: 'user',
          targetId: users[0]?.id ?? null,
          summary: `Imported ${users.length} users`,
          metadata: { departmentId, count: users.length, ...(registrar ? { delegated: registrar.scope } : {}) },
        });
      }
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
    const registrar = await this.registrars.resolve(actor);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, ...this.teamScope.user(actor), ...this.registrars.writeWhere(registrar, actor), deletedAt: null },
      select: { id: true, status: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // PR 346: an observer leaving the active state with open sessions notifies the admins once,
    // in the same transaction as the status change; repeating the same status never re-notifies.
    const { updatedUser, observerSessions } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId, organizationId },
        data: { status },
        select: userSelect,
      });
      const open = status !== 'active' ? await countOpenObserverSessions(tx, organizationId, userId) : 0;
      if (open > 0 && user.status === 'active') {
        await notifyObserverDeactivated(tx, { organizationId, observerId: userId, sessionCount: open });
      }
      return { updatedUser: updated, observerSessions: open };
    });

    const orphanedCourses = status !== 'active' ? await this.findSoleInstructorCourses(userId, organizationId) : [];

    await this.auditLog.record({
      organizationId,
      actorId: actor.id,
      action: 'user.status_changed',
      targetType: 'user',
      targetId: userId,
      summary: `Set user ${updatedUser.email} status to ${status}`,
      metadata: { status, observerSessions, ...(registrar ? { delegated: registrar.scope } : {}) },
    });

    return { ...updatedUser, orphanedCourses, observerSessions };
  }

  /** Administrator (or a holder of `user.reset-password`) issues a one-time reset link for a user in their scope. */
  async resetUserPassword(userId: string, actor: TeamScopeActor) {
    const organizationId = actor.organizationId;
    const registrar = await this.registrars.resolve(actor);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, ...this.teamScope.user(actor), ...this.registrars.writeWhere(registrar, actor), deletedAt: null },
      select: { id: true, organizationId: true, email: true, status: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== 'active') throw new ConflictException('Password can be reset only for an active user');
    if (!this.authService) throw new ConflictException('Password reset is not available');

    const issued = await this.authService.issuePasswordResetFor(user);
    await this.auditLog.record({
      organizationId,
      actorId: actor.id,
      action: 'user.password_reset_issued',
      targetType: 'user',
      targetId: userId,
      summary: `Issued a password reset for ${user.email}`,
      metadata: { delivered: issued.delivered, ...(registrar ? { delegated: registrar.scope } : {}) },
    });
    return issued;
  }

  /** PR 346: number of unfinished sessions the user observes, shown before the deactivation is confirmed. */
  async getObserverSessionImpact(userId: string, actor: TeamScopeActor) {
    const organizationId = actor.organizationId;
    const registrar = await this.registrars.resolve(actor);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, ...this.teamScope.user(actor), ...this.registrars.writeWhere(registrar, actor), deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return { observerSessions: await countOpenObserverSessions(this.prisma, organizationId, userId) };
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

  /** The department a registrar's new users go to (required for the department scope); built-in actors may name one too. */
  private async resolvePlacement(registrar: Registrar | null, organizationId: string, departmentId: string | undefined): Promise<string | null> {
    if (registrar) return this.registrars.assertDepartment(registrar, organizationId, departmentId);
    if (!departmentId) return null;
    return this.registrars.assertDepartment({ scope: 'organization', departmentIds: null }, organizationId, departmentId);
  }

  /** A registrar's new users are learners placed in the department; everything runs in one transaction. */
  private async placeNewUsers(
    tx: Pick<PrismaService, 'membership' | 'departmentMembership'>,
    organizationId: string,
    userIds: string[],
    departmentId: string | null,
    role: CreateUserRequestInput['role'],
    actorId: string | null,
  ) {
    if (role) {
      await tx.membership.createMany({ data: userIds.map((userId) => ({ organizationId, userId, role, assignedBy: actorId })) });
    }
    if (departmentId) {
      await tx.departmentMembership.createMany({ data: userIds.map((userId) => ({ organizationId, userId, departmentId, isPrimary: true })) });
    }
  }

  private async createPlaced(
    usersData: Array<Parameters<PrismaService['user']['create']>[0]['data']>,
    organizationId: string,
    departmentId: string | null,
    role: CreateUserRequestInput['role'],
    actorId: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const data of usersData) ids.push((await tx.user.create({ data, select: { id: true } })).id);
      await this.placeNewUsers(tx, organizationId, ids, departmentId, role, actorId);
      const created = await tx.user.findMany({ where: { id: { in: ids }, organizationId }, select: userSelect });
      const order = new Map(ids.map((id, index) => [id, index]));
      return created.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    });
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
