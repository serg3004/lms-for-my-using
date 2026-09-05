import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { OrgExternalReferencesService } from './org-external-references.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const departmentId = '22222222-2222-2222-2222-222222222222';
const actorId = '33333333-3333-3333-3333-333333333333';
const referenceId = '44444444-4444-4444-4444-444444444444';

function createPrisma(overrides: {
  department?: Partial<Record<'findFirst', jest.Mock>>;
  position?: Partial<Record<'findFirst', jest.Mock>>;
  departmentType?: Partial<Record<'findFirst', jest.Mock>>;
  orgExternalReference?: Partial<Record<'create' | 'findMany' | 'count' | 'findFirst' | 'delete', jest.Mock>>;
} = {}) {
  const base: Record<string, unknown> = {
    department: { findFirst: jest.fn(async () => ({ id: departmentId, status: 'active' })), ...overrides.department },
    position: { findFirst: jest.fn(async () => null), ...overrides.position },
    departmentType: { findFirst: jest.fn(async () => null), ...overrides.departmentType },
    orgExternalReference: {
      create: jest.fn(async () => ({
        id: referenceId,
        organizationId,
        entityType: 'DEPARTMENT',
        entityId: departmentId,
        sourceSystem: 'workday',
        externalId: 'ext-1',
      })),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      findFirst: jest.fn(async () => null),
      delete: jest.fn(async () => ({})),
      ...overrides.orgExternalReference,
    },
    orgStructureEvent: { create: jest.fn(async () => ({})) },
  };
  base['$transaction'] = jest.fn(async (fn: (tx: unknown) => unknown) => fn(base));
  return base as unknown as PrismaService;
}

describe('OrgExternalReferencesService', () => {
  describe('create', () => {
    it('rejects a mapping for an entity that does not exist in this tenant', async () => {
      const prisma = createPrisma({ department: { findFirst: jest.fn(async () => null) } });
      const service = new OrgExternalReferencesService(prisma);

      await expect(
        service.create({ organizationId, entityType: 'DEPARTMENT', entityId: departmentId, sourceSystem: 'workday', externalId: 'ext-1' }, actorId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates a mapping and records an org_external_reference.created event', async () => {
      const create = jest.fn(async () => ({
        id: referenceId,
        organizationId,
        entityType: 'DEPARTMENT',
        entityId: departmentId,
        sourceSystem: 'workday',
        externalId: 'ext-1',
      }));
      const eventCreate = jest.fn(async () => ({}));
      const prisma = createPrisma({ orgExternalReference: { create } });
      (prisma as unknown as { orgStructureEvent: { create: typeof eventCreate } }).orgStructureEvent = { create: eventCreate };

      const service = new OrgExternalReferencesService(prisma);
      const result = await service.create(
        { organizationId, entityType: 'DEPARTMENT', entityId: departmentId, sourceSystem: 'workday', externalId: 'ext-1' },
        actorId,
      );

      expect(result.id).toBe(referenceId);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ organizationId, entityType: 'DEPARTMENT', entityId: departmentId, sourceSystem: 'workday', externalId: 'ext-1' }) }),
      );
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'org_external_reference.created', entityId: referenceId }) }),
      );
    });

    it('never silently remaps -- a duplicate (org, source, entityType, externalId) is always a conflict', async () => {
      const duplicateError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
      const create = jest.fn(async () => {
        throw duplicateError;
      });
      const prisma = createPrisma({ orgExternalReference: { create } });
      const service = new OrgExternalReferencesService(prisma);

      await expect(
        service.create({ organizationId, entityType: 'DEPARTMENT', entityId: departmentId, sourceSystem: 'workday', externalId: 'ext-1' }, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('resolve', () => {
    it('throws when no mapping exists for the source system and external id', async () => {
      const prisma = createPrisma({ orgExternalReference: { findFirst: jest.fn(async () => null) } });
      const service = new OrgExternalReferencesService(prisma);

      await expect(
        service.resolve(organizationId, { entityType: 'DEPARTMENT', sourceSystem: 'workday', externalId: 'missing' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('resolves to the internal entity and reports its current status without reactivating it', async () => {
      const prisma = createPrisma({
        orgExternalReference: {
          findFirst: jest.fn(async () => ({ id: referenceId, organizationId, entityType: 'DEPARTMENT', entityId: departmentId, sourceSystem: 'workday', externalId: 'ext-1' })),
        },
        department: { findFirst: jest.fn(async () => ({ id: departmentId, status: 'archived' })) },
      });
      const service = new OrgExternalReferencesService(prisma);

      const result = await service.resolve(organizationId, { entityType: 'DEPARTMENT', sourceSystem: 'workday', externalId: 'ext-1' });
      expect(result).toEqual({ entityType: 'DEPARTMENT', entityId: departmentId, entityStatus: 'archived', sourceSystem: 'workday', externalId: 'ext-1' });
    });
  });

  describe('delete', () => {
    it('throws when the mapping does not exist in this tenant', async () => {
      const prisma = createPrisma({ orgExternalReference: { findFirst: jest.fn(async () => null) } });
      const service = new OrgExternalReferencesService(prisma);

      await expect(service.delete(referenceId, organizationId, actorId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes the mapping and records an org_external_reference.deleted event', async () => {
      const del = jest.fn(async () => ({}));
      const eventCreate = jest.fn(async () => ({}));
      const prisma = createPrisma({
        orgExternalReference: {
          findFirst: jest.fn(async () => ({ id: referenceId, entityType: 'DEPARTMENT', sourceSystem: 'workday' })),
          delete: del,
        },
      });
      (prisma as unknown as { orgStructureEvent: { create: typeof eventCreate } }).orgStructureEvent = { create: eventCreate };

      const service = new OrgExternalReferencesService(prisma);
      await service.delete(referenceId, organizationId, actorId);

      expect(del).toHaveBeenCalledWith({ where: { id: referenceId } });
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'org_external_reference.deleted', entityId: referenceId }) }),
      );
    });
  });
});
