import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { newOperationId, recordOrgStructureEvent } from '../departments/public.js';
import type {
  CreateOrgExternalReferenceInput,
  ListOrgExternalReferencesQuery,
  ResolveOrgExternalReferenceQuery,
} from './org-external-references.schemas.js';

const orgExternalReferenceSelect = {
  id: true,
  organizationId: true,
  entityType: true,
  entityId: true,
  sourceSystem: true,
  externalId: true,
  createdAt: true,
  updatedAt: true,
} as const;

type EntityType = 'DEPARTMENT' | 'DEPARTMENT_TYPE' | 'POSITION';
type EntitySummary = { id: string; status: 'active' | 'archived' };

function rethrowAsConflictOnDuplicateMapping(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException(
      'This externalId is already mapped for this source system and entity type. Delete the existing mapping first to remap it -- mappings are never silently replaced.',
    );
  }
  throw error;
}

@Injectable()
export class OrgExternalReferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Plan invariant: creation is create-only, never an upsert. A duplicate
   * (organizationId, sourceSystem, entityType, externalId) is always a conflict, even when it
   * would point at the same entityId -- a caller that wants to remap must delete the existing
   * mapping first, so a remap can never happen silently.
   */
  async create(input: CreateOrgExternalReferenceInput, actorId: string | null) {
    const entity = await this.findEntity(this.prisma, input.entityType, input.entityId, input.organizationId);
    if (!entity) throw new NotFoundException(`${input.entityType} not found`);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.orgExternalReference
        .create({
          data: {
            organizationId: input.organizationId,
            entityType: input.entityType,
            entityId: input.entityId,
            sourceSystem: input.sourceSystem,
            externalId: input.externalId,
          },
          select: orgExternalReferenceSelect,
        })
        .catch(rethrowAsConflictOnDuplicateMapping);

      await recordOrgStructureEvent(tx, {
        organizationId: input.organizationId,
        actorId,
        entityType: 'org_external_reference',
        entityId: created.id,
        eventType: 'org_external_reference.created',
        operationId: newOperationId(),
        metadata: { sourceSystem: created.sourceSystem, mappedEntityType: created.entityType },
      });

      return created;
    });
  }

  async list(organizationId: string, query: ListOrgExternalReferencesQuery) {
    const { page, pageSize, entityType, entityId, sourceSystem } = query;
    const where: Prisma.OrgExternalReferenceWhereInput = {
      organizationId,
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(sourceSystem ? { sourceSystem } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.orgExternalReference.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: orgExternalReferenceSelect,
      }),
      this.prisma.orgExternalReference.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /**
   * Tenant-scoped resolution: external system identifier -> internal entity. Never reactivates
   * an archived entity as a side effect -- callers (e.g. a future approved import flow) must
   * check `entityStatus` themselves and reject using an archived target, the same way CSV
   * import already rejects an archived department/position by code.
   */
  async resolve(organizationId: string, query: ResolveOrgExternalReferenceQuery) {
    const mapping = await this.prisma.orgExternalReference.findFirst({
      where: {
        organizationId,
        entityType: query.entityType,
        sourceSystem: query.sourceSystem,
        externalId: query.externalId,
      },
      select: orgExternalReferenceSelect,
    });
    if (!mapping) throw new NotFoundException('No external reference mapping found for this source system and external id');

    const entity = await this.findEntity(this.prisma, mapping.entityType, mapping.entityId, organizationId);
    return {
      entityType: mapping.entityType,
      entityId: mapping.entityId,
      entityStatus: entity?.status ?? null,
      sourceSystem: mapping.sourceSystem,
      externalId: mapping.externalId,
    };
  }

  async delete(id: string, organizationId: string, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.orgExternalReference.findFirst({
        where: { id, organizationId },
        select: { id: true, entityType: true, sourceSystem: true },
      });
      if (!existing) throw new NotFoundException('External reference not found');

      await tx.orgExternalReference.delete({ where: { id } });

      await recordOrgStructureEvent(tx, {
        organizationId,
        actorId,
        entityType: 'org_external_reference',
        entityId: id,
        eventType: 'org_external_reference.deleted',
        operationId: newOperationId(),
        metadata: { sourceSystem: existing.sourceSystem, mappedEntityType: existing.entityType },
      });
    });
  }

  private async findEntity(
    db: Prisma.TransactionClient | PrismaService,
    entityType: EntityType,
    entityId: string,
    organizationId: string,
  ): Promise<EntitySummary | null> {
    if (entityType === 'DEPARTMENT') {
      const row = await db.department.findFirst({ where: { id: entityId, organizationId }, select: { id: true, status: true } });
      return row ? { id: row.id, status: row.status } : null;
    }
    if (entityType === 'POSITION') {
      const row = await db.position.findFirst({ where: { id: entityId, organizationId }, select: { id: true, status: true } });
      return row ? { id: row.id, status: row.status } : null;
    }
    const row = await db.departmentType.findFirst({ where: { id: entityId, organizationId }, select: { id: true, isActive: true } });
    return row ? { id: row.id, status: row.isActive ? 'active' : 'archived' } : null;
  }
}
