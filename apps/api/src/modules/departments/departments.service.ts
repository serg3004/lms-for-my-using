import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { orgDepartmentTreeQueryDuration, orgReparentConflicts } from '../../common/observability/metrics.js';
import { logOrgDiagnostic, observeOrgDuration, orgFailureReason } from '../../common/observability/org-observability.js';
import {
  getAncestorIdChain,
  getDepartmentDepth,
  getDirectHeadcounts,
  getSubtreeHeadcounts,
  getSubtreeHeight,
  isSelfOrDescendant,
} from './department-tree-queries.js';
import {
  newOperationId,
  recordOrgStructureEvent,
  runSerializableWithRetry,
} from './org-structure-event.js';
import {
  CreateDepartmentInput,
  ListDepartmentsQuery,
  MAX_DEPARTMENT_DEPTH,
  MoveDepartmentInput,
  UpdateDepartmentInput,
} from './departments.schemas.js';

const departmentSelect = {
  id: true,
  organizationId: true,
  parentId: true,
  departmentTypeId: true,
  name: true,
  code: true,
  description: true,
  sortOrder: true,
  status: true,
  directManagerMode: true,
  functionalManagerMode: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { children: true } },
} as const;

const DEPARTMENT_SORT: Prisma.DepartmentOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { name: 'asc' },
  { id: 'asc' },
];

type DepartmentRow = Prisma.DepartmentGetPayload<{ select: typeof departmentSelect }>;
type DepartmentWithHeadcounts = DepartmentRow & { directUserCount: number; subtreeUserCount: number };

function rethrowAsConflictOnDuplicateCode(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException('A department with this code already exists in the organization');
  }
  throw error;
}

@Injectable()
export class DepartmentsService {
  private readonly logger = new Logger(DepartmentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Batches both headcount queries once for the whole given array, never per department --
   * every tree/read response attaches counts through this single entry point so a future edit
   * to one call site can't accidentally reintroduce an N+1.
   */
  private async withHeadcounts(departments: DepartmentRow[], organizationId: string): Promise<DepartmentWithHeadcounts[]> {
    if (departments.length === 0) return [];
    const ids = departments.map((department) => department.id);
    const [direct, subtree] = await Promise.all([
      getDirectHeadcounts(this.prisma, ids, organizationId),
      getSubtreeHeadcounts(this.prisma, ids, organizationId),
    ]);
    return departments.map((department) => ({
      ...department,
      directUserCount: direct.get(department.id) ?? 0,
      subtreeUserCount: subtree.get(department.id) ?? 0,
    }));
  }

  async listDepartments(organizationId: string, query: ListDepartmentsQuery) {
    const { page, pageSize, search, departmentTypeId, status } = query;
    const skip = (page - 1) * pageSize;
    const where: Prisma.DepartmentWhereInput = {
      organizationId,
      ...(status ? { status } : {}),
      ...(departmentTypeId ? { departmentTypeId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { code: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rawItems, total] = await Promise.all([
      this.prisma.department.findMany({ where, orderBy: DEPARTMENT_SORT, skip, take: pageSize, select: departmentSelect }),
      this.prisma.department.count({ where }),
    ]);
    const items = await this.withHeadcounts(rawItems, organizationId);

    return { items, page, pageSize, total };
  }

  /** Roots only — callers load children lazily via getChildren. */
  async getTree(organizationId: string, status?: 'active' | 'archived') {
    return observeOrgDuration(orgDepartmentTreeQueryDuration, { operation: 'roots' }, async () => {
      const roots = await this.prisma.department.findMany({
        where: { organizationId, parentId: null, status: status ?? 'active' },
        orderBy: DEPARTMENT_SORT,
        select: departmentSelect,
      });
      return this.withHeadcounts(roots, organizationId);
    });
  }

  async getDepartment(id: string, organizationId: string) {
    const department = await this.prisma.department.findFirst({ where: { id, organizationId }, select: departmentSelect });
    if (!department) throw new NotFoundException('Department not found');
    const [withCounts] = await this.withHeadcounts([department], organizationId);
    return withCounts!;
  }

  async getChildren(id: string, organizationId: string, status?: 'active' | 'archived') {
    return observeOrgDuration(orgDepartmentTreeQueryDuration, { operation: 'children' }, async () => {
      await this.ensureDepartmentExists(id, organizationId);
      const children = await this.prisma.department.findMany({
        where: { organizationId, parentId: id, status: status ?? 'active' },
        orderBy: DEPARTMENT_SORT,
        select: departmentSelect,
      });
      return this.withHeadcounts(children, organizationId);
    });
  }

  async getPath(id: string, organizationId: string) {
    return observeOrgDuration(orgDepartmentTreeQueryDuration, { operation: 'path' }, async () => {
      await this.ensureDepartmentExists(id, organizationId);
      const ids = await getAncestorIdChain(this.prisma, id, organizationId);
      const rawRows = await this.prisma.department.findMany({ where: { id: { in: ids }, organizationId }, select: departmentSelect });
      const rows = await this.withHeadcounts(rawRows, organizationId);
      const byId = new Map(rows.map((row) => [row.id, row]));
      return ids.map((ancestorId) => byId.get(ancestorId)).filter((row): row is NonNullable<typeof row> => Boolean(row));
    });
  }

  async createDepartment(input: CreateDepartmentInput, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const organizationId = input.organizationId;
      let depth = 1;

      if (input.parentId) {
        const parent = await tx.department.findFirst({ where: { id: input.parentId, organizationId }, select: { id: true, status: true } });
        if (!parent) throw new NotFoundException('Parent department not found');
        if (parent.status !== 'active') throw new ConflictException('Archived department cannot be selected as a parent');
        depth = (await getDepartmentDepth(tx, input.parentId, organizationId)) + 1;
      }

      if (depth > MAX_DEPARTMENT_DEPTH) {
        throw new BadRequestException(`Department depth cannot exceed ${MAX_DEPARTMENT_DEPTH} levels`);
      }

      if (input.departmentTypeId) {
        const type = await tx.departmentType.findFirst({ where: { id: input.departmentTypeId, organizationId }, select: { id: true } });
        if (!type) throw new NotFoundException('Department type not found');
      }

      const created = await tx.department
        .create({
          data: {
            organizationId,
            parentId: input.parentId ?? null,
            departmentTypeId: input.departmentTypeId ?? null,
            name: input.name,
            code: input.code ?? null,
            description: input.description ?? null,
            sortOrder: input.sortOrder,
            directManagerMode: input.directManagerMode,
            functionalManagerMode: input.functionalManagerMode,
          },
          select: departmentSelect,
        })
        .catch(rethrowAsConflictOnDuplicateCode);

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'department',
        entityId: created.id,
        eventType: 'department.created',
        operationId: newOperationId(),
        metadata: { name: created.name, parentId: created.parentId, departmentTypeId: created.departmentTypeId },
      });

      return created;
    });
  }

  async updateDepartment(id: string, organizationId: string, input: UpdateDepartmentInput, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.department.findFirst({ where: { id, organizationId }, select: { id: true } });
      if (!existing) throw new NotFoundException('Department not found');

      if (input.departmentTypeId) {
        const type = await tx.departmentType.findFirst({ where: { id: input.departmentTypeId, organizationId }, select: { id: true } });
        if (!type) throw new NotFoundException('Department type not found');
      }

      const updated = await tx.department
        .update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.departmentTypeId !== undefined ? { departmentTypeId: input.departmentTypeId } : {}),
            ...(input.code !== undefined ? { code: input.code } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          },
          select: departmentSelect,
        })
        .catch(rethrowAsConflictOnDuplicateCode);

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'department',
        entityId: id,
        eventType: 'department.updated',
        operationId: newOperationId(),
        metadata: { fields: Object.keys(input) },
      });

      return updated;
    });
  }

  /**
   * Reparent under Serializable isolation with bounded retry (plan invariants #18/#19):
   * two concurrent moves that would together form a cycle (A under B, B under A) must
   * never both commit. Every guard below reads state inside this transaction, so a
   * losing concurrent writer either serialization-fails (retried) or observes the
   * winner's committed change and is rejected by the cycle/depth checks.
   */
  async moveDepartment(id: string, organizationId: string, input: MoveDepartmentInput, actorId: string | null) {
    try {
      return await runSerializableWithRetry(this.prisma, async (tx) => {
      const target = await tx.department.findFirst({ where: { id, organizationId }, select: { id: true, parentId: true } });
      if (!target) throw new NotFoundException('Department not found');

      const newParentId = input.parentId;

      if (newParentId !== null) {
        if (newParentId === id) throw new BadRequestException('A department cannot become its own parent');

        const parent = await tx.department.findFirst({ where: { id: newParentId, organizationId }, select: { id: true, status: true } });
        if (!parent) throw new NotFoundException('Target parent department not found');
        if (parent.status !== 'active') throw new ConflictException('Archived department cannot be selected as a parent');

        const wouldCycle = await isSelfOrDescendant(tx, id, newParentId, organizationId);
        if (wouldCycle) throw new ConflictException('Cannot move a department under one of its own descendants');
      }

      const subtreeHeight = await getSubtreeHeight(tx, id, organizationId);
      const newSelfDepth = newParentId ? (await getDepartmentDepth(tx, newParentId, organizationId)) + 1 : 1;
      if (newSelfDepth + subtreeHeight > MAX_DEPARTMENT_DEPTH) {
        throw new BadRequestException(`Move would exceed the maximum department depth of ${MAX_DEPARTMENT_DEPTH} levels`);
      }

      const previousParentId = target.parentId;
      const updated = await tx.department.update({ where: { id }, data: { parentId: newParentId }, select: departmentSelect });

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'department',
        entityId: id,
        eventType: 'department.moved',
        operationId: newOperationId(),
        metadata: { fromParentId: previousParentId, toParentId: newParentId },
      });

      return updated;
      });
    } catch (error) {
      const reason = orgFailureReason(error);
      orgReparentConflicts.inc({ reason });
      logOrgDiagnostic(this.logger, 'org_reparent_failed', reason);
      throw error;
    }
  }

  async archiveDepartment(id: string, organizationId: string, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const department = await tx.department.findFirst({ where: { id, organizationId }, select: { id: true, status: true } });
      if (!department) throw new NotFoundException('Department not found');
      if (department.status === 'archived') throw new ConflictException('Department is already archived');

      const activeChild = await tx.department.findFirst({
        where: { organizationId, parentId: id, status: 'active' },
        select: { id: true },
      });
      if (activeChild) throw new ConflictException('Cannot archive a department that has active children');

      const [currentMembership, currentManager, activeAssignment] = await Promise.all([
        tx.departmentMembership.findFirst({ where: { organizationId, departmentId: id, effectiveTo: null }, select: { id: true } }),
        tx.departmentManager.findFirst({ where: { organizationId, departmentId: id, effectiveTo: null }, select: { id: true } }),
        tx.assignment.findFirst({ where: { organizationId, departmentId: id, deletedAt: null, status: { not: 'cancelled' } }, select: { id: true } }),
      ]);
      if (currentMembership) throw new ConflictException('Cannot archive a department with current memberships');
      if (currentManager) throw new ConflictException('Cannot archive a department with current local managers');
      if (activeAssignment) throw new ConflictException('Cannot archive a department with active learning assignments');

      const updated = await tx.department.update({
        where: { id },
        data: { status: 'archived', archivedAt: new Date() },
        select: departmentSelect,
      });

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'department',
        entityId: id,
        eventType: 'department.archived',
        operationId: newOperationId(),
      });

      return updated;
    });
  }

  async restoreDepartment(id: string, organizationId: string, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const department = await tx.department.findFirst({
        where: { id, organizationId },
        select: { id: true, status: true, parentId: true },
      });
      if (!department) throw new NotFoundException('Department not found');
      if (department.status !== 'archived') throw new ConflictException('Department is not archived');

      if (department.parentId) {
        const parent = await tx.department.findFirst({
          where: { id: department.parentId, organizationId },
          select: { id: true, status: true },
        });
        if (!parent) throw new NotFoundException('Parent department not found');
        if (parent.status !== 'active') throw new ConflictException('Archived department cannot be selected as a parent');

        const wouldCycle = await isSelfOrDescendant(tx, id, department.parentId, organizationId);
        if (wouldCycle) throw new ConflictException('Cannot restore a department whose parent is one of its own descendants');
      }

      const subtreeHeight = await getSubtreeHeight(tx, id, organizationId);
      const selfDepth = department.parentId ? (await getDepartmentDepth(tx, department.parentId, organizationId)) + 1 : 1;
      if (selfDepth + subtreeHeight > MAX_DEPARTMENT_DEPTH) {
        throw new BadRequestException(`Restoring would exceed the maximum department depth of ${MAX_DEPARTMENT_DEPTH} levels`);
      }

      const updated = await tx.department
        .update({ where: { id }, data: { status: 'active', archivedAt: null }, select: departmentSelect })
        .catch(rethrowAsConflictOnDuplicateCode);

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'department',
        entityId: id,
        eventType: 'department.restored',
        operationId: newOperationId(),
      });

      return updated;
    });
  }

  private async ensureDepartmentExists(id: string, organizationId: string) {
    const department = await this.prisma.department.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!department) throw new NotFoundException('Department not found');
  }
}
