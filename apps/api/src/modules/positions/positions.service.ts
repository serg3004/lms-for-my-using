import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { newOperationId, recordOrgStructureEvent } from '../departments/public.js';
import { CreatePositionInput, ListPositionsQuery, UpdatePositionInput } from './positions.schemas.js';

const positionSelect = {
  id: true,
  organizationId: true,
  code: true,
  title: true,
  description: true,
  status: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const POSITION_SORT: Prisma.PositionOrderByWithRelationInput[] = [
  { title: 'asc' },
  { id: 'asc' },
];

function rethrowAsConflictOnDuplicateCode(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException('A position with this code already exists in the organization');
  }
  throw error;
}

@Injectable()
export class PositionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPositions(organizationId: string, query: ListPositionsQuery) {
    const { page, pageSize, search, status } = query;
    const skip = (page - 1) * pageSize;
    const where: Prisma.PositionWhereInput = {
      organizationId,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              { code: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.position.findMany({ where, orderBy: POSITION_SORT, skip, take: pageSize, select: positionSelect }),
      this.prisma.position.count({ where }),
    ]);

    return { items, page, pageSize, total };
  }

  async getPosition(id: string, organizationId: string) {
    const position = await this.prisma.position.findFirst({ where: { id, organizationId }, select: positionSelect });
    if (!position) throw new NotFoundException('Position not found');
    return position;
  }

  async createPosition(input: CreatePositionInput, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.position
        .create({
          data: {
            organizationId: input.organizationId,
            code: input.code,
            title: input.title,
            description: input.description ?? null,
          },
          select: positionSelect,
        })
        .catch(rethrowAsConflictOnDuplicateCode);

      await recordOrgStructureEvent(tx, {
        organizationId: input.organizationId,
        actorId,
        entityType: 'position',
        entityId: created.id,
        eventType: 'position.created',
        operationId: newOperationId(),
        metadata: { code: created.code, title: created.title },
      });

      return created;
    });
  }

  async updatePosition(id: string, organizationId: string, input: UpdatePositionInput, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.position.findFirst({ where: { id, organizationId }, select: { id: true } });
      if (!existing) throw new NotFoundException('Position not found');

      const updated = await tx.position
        .update({
          where: { id },
          data: {
            ...(input.code !== undefined ? { code: input.code } : {}),
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
          },
          select: positionSelect,
        })
        .catch(rethrowAsConflictOnDuplicateCode);

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'position',
        entityId: id,
        eventType: 'position.updated',
        operationId: newOperationId(),
        metadata: { fields: Object.keys(input) },
      });

      return updated;
    });
  }

  async archivePosition(id: string, organizationId: string, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.position.findFirst({ where: { id, organizationId }, select: { id: true, status: true } });
      if (!existing) throw new NotFoundException('Position not found');
      if (existing.status === 'archived') throw new ConflictException('Position is already archived');

      const [currentMembership, activeCourse] = await Promise.all([
        tx.departmentMembership.findFirst({ where: { organizationId, positionId: id, effectiveTo: null }, select: { id: true } }),
        tx.positionCourse.findFirst({ where: { organizationId, positionId: id, status: 'active' }, select: { id: true } }),
      ]);
      if (currentMembership) throw new ConflictException('Cannot archive a position used by a current membership');
      if (activeCourse) throw new ConflictException('Cannot archive a position with active course requirements');

      const updated = await tx.position.update({
        where: { id },
        data: { status: 'archived', archivedAt: new Date() },
        select: positionSelect,
      });

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'position',
        entityId: id,
        eventType: 'position.archived',
        operationId: newOperationId(),
      });

      return updated;
    });
  }

  async restorePosition(id: string, organizationId: string, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.position.findFirst({ where: { id, organizationId }, select: { id: true, status: true } });
      if (!existing) throw new NotFoundException('Position not found');
      if (existing.status !== 'archived') throw new ConflictException('Position is not archived');

      const updated = await tx.position
        .update({ where: { id }, data: { status: 'active', archivedAt: null }, select: positionSelect })
        .catch(rethrowAsConflictOnDuplicateCode);

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'position',
        entityId: id,
        eventType: 'position.restored',
        operationId: newOperationId(),
      });

      return updated;
    });
  }
}
