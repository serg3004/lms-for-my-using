import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { newOperationId, recordOrgStructureEvent } from './org-structure-event.js';
import { CreateDepartmentTypeInput, UpdateDepartmentTypeInput } from './departments.schemas.js';

const departmentTypeSelect = {
  id: true,
  organizationId: true,
  code: true,
  name: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const DEPARTMENT_TYPE_SORT: Prisma.DepartmentTypeOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { name: 'asc' },
  { id: 'asc' },
];

function rethrowAsConflictOnDuplicateCode(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException('A department type with this code already exists in the organization');
  }
  throw error;
}

@Injectable()
export class DepartmentTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async listDepartmentTypes(organizationId: string) {
    return this.prisma.departmentType.findMany({
      where: { organizationId },
      orderBy: DEPARTMENT_TYPE_SORT,
      select: departmentTypeSelect,
    });
  }

  async createDepartmentType(input: CreateDepartmentTypeInput, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.departmentType
        .create({
          data: { organizationId: input.organizationId, code: input.code, name: input.name, sortOrder: input.sortOrder },
          select: departmentTypeSelect,
        })
        .catch(rethrowAsConflictOnDuplicateCode);

      await recordOrgStructureEvent(tx, {
        organizationId: input.organizationId,
        actorId,
        entityType: 'department_type',
        entityId: created.id,
        eventType: 'department_type.created',
        operationId: newOperationId(),
        metadata: { code: created.code, name: created.name },
      });

      return created;
    });
  }

  async updateDepartmentType(id: string, organizationId: string, input: UpdateDepartmentTypeInput, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.departmentType.findFirst({ where: { id, organizationId }, select: { id: true } });
      if (!existing) throw new NotFoundException('Department type not found');

      const updated = await tx.departmentType
        .update({
          where: { id },
          data: {
            ...(input.code !== undefined ? { code: input.code } : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          },
          select: departmentTypeSelect,
        })
        .catch(rethrowAsConflictOnDuplicateCode);

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'department_type',
        entityId: id,
        eventType: 'department_type.updated',
        operationId: newOperationId(),
        metadata: { fields: Object.keys(input) },
      });

      return updated;
    });
  }

  async archiveDepartmentType(id: string, organizationId: string, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.departmentType.findFirst({ where: { id, organizationId }, select: { id: true, isActive: true } });
      if (!existing) throw new NotFoundException('Department type not found');
      if (!existing.isActive) throw new ConflictException('Department type is already archived');

      const updated = await tx.departmentType.update({ where: { id }, data: { isActive: false }, select: departmentTypeSelect });

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'department_type',
        entityId: id,
        eventType: 'department_type.archived',
        operationId: newOperationId(),
      });

      return updated;
    });
  }

  async restoreDepartmentType(id: string, organizationId: string, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.departmentType.findFirst({ where: { id, organizationId }, select: { id: true, isActive: true } });
      if (!existing) throw new NotFoundException('Department type not found');
      if (existing.isActive) throw new ConflictException('Department type is not archived');

      const updated = await tx.departmentType.update({ where: { id }, data: { isActive: true }, select: departmentTypeSelect });

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'department_type',
        entityId: id,
        eventType: 'department_type.restored',
        operationId: newOperationId(),
      });

      return updated;
    });
  }
}
