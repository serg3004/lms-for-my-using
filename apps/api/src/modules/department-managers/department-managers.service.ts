import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { newOperationId, recordOrgStructureEvent, runSerializableWithRetry } from '../departments/public.js';
import { computeEffectiveDepartmentManagers } from './effective-managers.js';
import { CreateDepartmentManagerInput, UpdateManagerModesInput } from './department-managers.schemas.js';

type TransactionClient = Prisma.TransactionClient;

const managerSelect = {
  id: true,
  organizationId: true,
  departmentId: true,
  userId: true,
  type: true,
  isPrimary: true,
  effectiveFrom: true,
  effectiveTo: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Distinguishes which partial unique index a P2002 hit, per the plan's two manager invariants. */
function rethrowManagerConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target ?? '');
    if (target.includes('current_primary')) {
      throw new ConflictException('This department already has a current primary manager of this type');
    }
    throw new ConflictException('User is already a current manager of this type in this department');
  }
  throw error;
}

async function ensureAssignable(client: TransactionClient, organizationId: string, departmentId: string, userId: string) {
  const [department, user] = await Promise.all([
    client.department.findFirst({ where: { id: departmentId, organizationId }, select: { id: true, status: true } }),
    client.user.findFirst({ where: { id: userId, organizationId }, select: { id: true, status: true } }),
  ]);
  if (!department) throw new NotFoundException('Department not found');
  if (department.status !== 'active') throw new ConflictException('Cannot assign a manager to an archived department');
  if (!user) throw new NotFoundException('User not found');
  if (user.status !== 'active') throw new ConflictException('Cannot assign an inactive user as a manager');
}

@Injectable()
export class DepartmentManagersService {
  constructor(private readonly prisma: PrismaService) {}

  async listEffectiveManagers(departmentId: string, organizationId: string) {
    const department = await this.prisma.department.findFirst({ where: { id: departmentId, organizationId }, select: { id: true } });
    if (!department) throw new NotFoundException('Department not found');

    const effective = await computeEffectiveDepartmentManagers(this.prisma, departmentId, organizationId);
    if (effective.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(effective.map((manager) => manager.userId))] }, organizationId },
      select: { id: true, firstName: true, lastName: true, email: true, status: true },
    });
    const userById = new Map(users.map((user) => [user.id, user]));

    return effective.map((manager) => ({ ...manager, user: userById.get(manager.userId) ?? null }));
  }

  async createManager(input: CreateDepartmentManagerInput, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      await ensureAssignable(tx, input.organizationId, input.departmentId, input.userId);

      const created = await tx.departmentManager
        .create({
          data: {
            organizationId: input.organizationId,
            departmentId: input.departmentId,
            userId: input.userId,
            type: input.type,
            isPrimary: input.isPrimary,
          },
          select: managerSelect,
        })
        .catch(rethrowManagerConflict);

      await recordOrgStructureEvent(tx, {
        organizationId: input.organizationId,
        actorId,
        entityType: 'department_manager',
        entityId: created.id,
        eventType: 'department_manager.created',
        operationId: newOperationId(),
        metadata: { departmentId: input.departmentId, userId: input.userId, type: input.type, isPrimary: input.isPrimary },
      });

      return created;
    });
  }

  async closeManager(id: string, organizationId: string, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.departmentManager.findFirst({
        where: { id, organizationId },
        select: { id: true, effectiveTo: true, departmentId: true, userId: true, type: true },
      });
      if (!existing) throw new NotFoundException('Department manager not found');
      if (existing.effectiveTo !== null) throw new ConflictException('Department manager is already closed');

      const updated = await tx.departmentManager.update({
        where: { id },
        data: { effectiveTo: new Date() },
        select: managerSelect,
      });

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'department_manager',
        entityId: id,
        eventType: 'department_manager.closed',
        operationId: newOperationId(),
        metadata: { departmentId: existing.departmentId, userId: existing.userId, type: existing.type },
      });

      return updated;
    });
  }

  /**
   * Switching LOCAL/MERGE -> INHERIT for a manager type must reject while current local
   * managers of that type exist, per plan invariant, so it never silently hides them.
   * Runs Serializable with retry to close the race against a concurrent createManager for
   * the same department+type landing between the check and the write.
   */
  async updateManagerModes(departmentId: string, organizationId: string, input: UpdateManagerModesInput, actorId: string | null) {
    return runSerializableWithRetry(this.prisma, async (tx) => {
      const department = await tx.department.findFirst({ where: { id: departmentId, organizationId }, select: { id: true } });
      if (!department) throw new NotFoundException('Department not found');

      for (const [mode, type] of [
        [input.directManagerMode, 'DIRECT'],
        [input.functionalManagerMode, 'FUNCTIONAL'],
      ] as const) {
        if (mode !== 'INHERIT') continue;
        const hasLocalManagers = await tx.departmentManager.findFirst({
          where: { organizationId, departmentId, type, effectiveTo: null },
          select: { id: true },
        });
        if (hasLocalManagers) {
          throw new ConflictException(
            `Cannot switch ${type} manager mode to INHERIT while current local ${type} managers exist; close them first`,
          );
        }
      }

      const updated = await tx.department.update({
        where: { id: departmentId },
        data: {
          ...(input.directManagerMode !== undefined ? { directManagerMode: input.directManagerMode } : {}),
          ...(input.functionalManagerMode !== undefined ? { functionalManagerMode: input.functionalManagerMode } : {}),
        },
        select: { id: true, organizationId: true, directManagerMode: true, functionalManagerMode: true },
      });

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'department',
        entityId: departmentId,
        eventType: 'department.manager_modes_updated',
        operationId: newOperationId(),
        metadata: { directManagerMode: input.directManagerMode, functionalManagerMode: input.functionalManagerMode },
      });

      return updated;
    });
  }
}
