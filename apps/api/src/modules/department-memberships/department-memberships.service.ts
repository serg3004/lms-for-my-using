import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { newOperationId, recordOrgStructureEvent, runSerializableWithRetry } from '../departments/public.js';
import { BulkTransferInput, CreateDepartmentMembershipInput, DepartmentTransferInput, ListDepartmentUsersQuery } from './department-memberships.schemas.js';

type TransactionClient = Prisma.TransactionClient;

const membershipSelect = {
  id: true,
  organizationId: true,
  departmentId: true,
  userId: true,
  positionId: true,
  isPrimary: true,
  effectiveFrom: true,
  effectiveTo: true,
  createdAt: true,
  updatedAt: true,
} as const;

const positionSummarySelect = { id: true, code: true, title: true, status: true } as const;

/** Distinguishes which partial unique index a P2002 hit, per the plan's two membership invariants. */
function rethrowMembershipConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target ?? '');
    if (target.includes('current_primary')) {
      throw new ConflictException('User already has a current primary department membership');
    }
    throw new ConflictException('User already has a current membership in this department');
  }
  throw error;
}

async function ensureAssignable(client: TransactionClient, organizationId: string, departmentId: string, userId: string) {
  const [department, user] = await Promise.all([
    client.department.findFirst({ where: { id: departmentId, organizationId }, select: { id: true, status: true } }),
    client.user.findFirst({ where: { id: userId, organizationId }, select: { id: true, status: true } }),
  ]);
  if (!department) throw new NotFoundException('Department not found');
  if (department.status !== 'active') throw new ConflictException('Cannot assign to an archived department');
  if (!user) throw new NotFoundException('User not found');
  if (user.status !== 'active') throw new ConflictException('Cannot assign an inactive user to a department');
}

/** Plan invariant: an archived Position remains valid in history but cannot be assigned to a new current relation. */
async function ensurePositionAssignable(client: TransactionClient, organizationId: string, positionId: string | undefined) {
  if (!positionId) return;
  const position = await client.position.findFirst({ where: { id: positionId, organizationId }, select: { id: true, status: true } });
  if (!position) throw new NotFoundException('Position not found');
  if (position.status !== 'active') throw new ConflictException('Cannot assign an archived position');
}

@Injectable()
export class DepartmentMembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async listDepartmentUsers(departmentId: string, organizationId: string, query: ListDepartmentUsersQuery) {
    const department = await this.prisma.department.findFirst({ where: { id: departmentId, organizationId }, select: { id: true } });
    if (!department) throw new NotFoundException('Department not found');

    const { page, pageSize, search } = query;
    const where: Prisma.DepartmentMembershipWhereInput = {
      departmentId,
      organizationId,
      effectiveTo: null,
      ...(search
        ? {
            user: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' as const } },
                { lastName: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.departmentMembership.findMany({
        where,
        // `id` is a required tie-breaker: a bulk transfer gives every transferred row the same
        // isPrimary=true and the same effectiveFrom timestamp, so without it offset pagination
        // has no deterministic order across those rows and separate page requests can duplicate
        // or skip users.
        orderBy: [{ isPrimary: 'desc' }, { effectiveFrom: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          ...membershipSelect,
          user: { select: { id: true, firstName: true, lastName: true, email: true, status: true } },
          position: { select: positionSummarySelect },
        },
      }),
      this.prisma.departmentMembership.count({ where }),
    ]);

    return { items, page, pageSize, total };
  }

  async listUserMemberships(userId: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.departmentMembership.findMany({
      where: { userId, organizationId },
      orderBy: [{ effectiveFrom: 'desc' }],
      select: {
        ...membershipSelect,
        department: { select: { id: true, name: true, status: true } },
        position: { select: positionSummarySelect },
      },
    });
  }

  async createMembership(input: CreateDepartmentMembershipInput, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      await ensureAssignable(tx, input.organizationId, input.departmentId, input.userId);
      await ensurePositionAssignable(tx, input.organizationId, input.positionId);

      const created = await tx.departmentMembership
        .create({
          data: {
            organizationId: input.organizationId,
            departmentId: input.departmentId,
            userId: input.userId,
            isPrimary: input.isPrimary,
            positionId: input.positionId ?? null,
          },
          select: membershipSelect,
        })
        .catch(rethrowMembershipConflict);

      await recordOrgStructureEvent(tx, {
        organizationId: input.organizationId,
        actorId,
        entityType: 'department_membership',
        entityId: created.id,
        eventType: 'department_membership.created',
        operationId: newOperationId(),
        metadata: { departmentId: input.departmentId, userId: input.userId, isPrimary: input.isPrimary, positionId: input.positionId ?? null },
      });

      return created;
    });
  }

  async closeMembership(id: string, organizationId: string, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.departmentMembership.findFirst({
        where: { id, organizationId },
        select: { id: true, effectiveTo: true, departmentId: true, userId: true },
      });
      if (!existing) throw new NotFoundException('Department membership not found');
      if (existing.effectiveTo !== null) throw new ConflictException('Department membership is already closed');

      const updated = await tx.departmentMembership.update({
        where: { id },
        data: { effectiveTo: new Date() },
        select: membershipSelect,
      });

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'department_membership',
        entityId: id,
        eventType: 'department_membership.closed',
        operationId: newOperationId(),
        metadata: { departmentId: existing.departmentId, userId: existing.userId },
      });

      return updated;
    });
  }

  /** Transfer = close the user's current primary membership (if any) + create a new one, atomically. */
  async transferPrimaryDepartment(userId: string, organizationId: string, input: DepartmentTransferInput, actorId: string | null) {
    return runSerializableWithRetry(this.prisma, async (tx) => {
      await ensureAssignable(tx, organizationId, input.departmentId, userId);
      await ensurePositionAssignable(tx, organizationId, input.positionId);

      const currentPrimary = await tx.departmentMembership.findFirst({
        where: { organizationId, userId, isPrimary: true, effectiveTo: null },
        select: { id: true, departmentId: true },
      });
      if (currentPrimary?.departmentId === input.departmentId) {
        throw new ConflictException('User already has this department as their current primary department');
      }

      const now = new Date();
      if (currentPrimary) {
        await tx.departmentMembership.update({ where: { id: currentPrimary.id }, data: { effectiveTo: now } });
      }

      const created = await tx.departmentMembership
        .create({
          data: {
            organizationId,
            departmentId: input.departmentId,
            userId,
            isPrimary: true,
            effectiveFrom: now,
            positionId: input.positionId ?? null,
          },
          select: membershipSelect,
        })
        .catch(rethrowMembershipConflict);

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'department_membership',
        entityId: created.id,
        eventType: 'department_membership.transferred',
        operationId: newOperationId(),
        metadata: {
          userId,
          fromDepartmentId: currentPrimary?.departmentId ?? null,
          toDepartmentId: input.departmentId,
          positionId: input.positionId ?? null,
        },
      });

      return created;
    });
  }

  /** Bulk transfer = the same close-old-primary + create-new-primary move, applied to every user in one transaction. */
  async bulkTransfer(departmentId: string, organizationId: string, input: BulkTransferInput, actorId: string | null) {
    return runSerializableWithRetry(this.prisma, async (tx) => {
      const department = await tx.department.findFirst({ where: { id: departmentId, organizationId }, select: { id: true, status: true } });
      if (!department) throw new NotFoundException('Department not found');
      if (department.status !== 'active') throw new ConflictException('Cannot assign to an archived department');
      await ensurePositionAssignable(tx, organizationId, input.positionId);

      const uniqueUserIds = [...new Set(input.userIds)];
      const users = await tx.user.findMany({ where: { id: { in: uniqueUserIds }, organizationId }, select: { id: true, status: true } });
      if (users.length !== uniqueUserIds.length) throw new NotFoundException('One or more users not found');
      const inactiveUser = users.find((user) => user.status !== 'active');
      if (inactiveUser) throw new ConflictException('Cannot assign an inactive user to a department');

      const operationId = newOperationId();
      const now = new Date();
      const created = [];

      for (const userId of uniqueUserIds) {
        const currentPrimary = await tx.departmentMembership.findFirst({
          where: { organizationId, userId, isPrimary: true, effectiveTo: null },
          select: { id: true, departmentId: true },
        });
        if (currentPrimary?.departmentId === departmentId) continue;

        if (currentPrimary) {
          await tx.departmentMembership.update({ where: { id: currentPrimary.id }, data: { effectiveTo: now } });
        }

        const membership = await tx.departmentMembership
          .create({
            data: {
              organizationId,
              departmentId,
              userId,
              isPrimary: true,
              effectiveFrom: now,
              positionId: input.positionId ?? null,
            },
            select: membershipSelect,
          })
          .catch(rethrowMembershipConflict);

        await recordOrgStructureEvent(tx, {
          organizationId,
          actorId,
          entityType: 'department_membership',
          entityId: membership.id,
          eventType: 'department_membership.bulk_transferred',
          operationId,
          metadata: {
            userId,
            fromDepartmentId: currentPrimary?.departmentId ?? null,
            toDepartmentId: departmentId,
            positionId: input.positionId ?? null,
          },
        });

        created.push(membership);
      }

      return created;
    });
  }
}
