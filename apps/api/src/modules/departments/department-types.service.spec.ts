import { ConflictException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { DepartmentTypesService } from './department-types.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const typeId = '55555555-5555-5555-5555-555555555555';
const actorId = '44444444-4444-4444-4444-444444444444';

function createPrisma(overrides: {
  departmentType?: Partial<Record<'findFirst' | 'findMany' | 'create' | 'update', jest.Mock>>;
} = {}) {
  const base: Record<string, unknown> = {
    departmentType: {
      findFirst: jest.fn(),
      findMany: jest.fn(async () => []),
      create: jest.fn(),
      update: jest.fn(),
      ...overrides.departmentType,
    },
    orgStructureEvent: { create: jest.fn(async () => ({})) },
  };
  base['$transaction'] = jest.fn(async (fn: (tx: unknown) => unknown) => fn(base));
  return base as unknown as PrismaService;
}

describe('DepartmentTypesService', () => {
  describe('listDepartmentTypes', () => {
    it('lists types sorted by sortOrder then name, tenant-scoped', async () => {
      const findMany = jest.fn(async () => []);
      const prisma = createPrisma({ departmentType: { findMany } });
      const service = new DepartmentTypesService(prisma);

      await service.listDepartmentTypes(organizationId);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }] }),
      );
    });
  });

  describe('createDepartmentType', () => {
    it('creates a type and records an OrgStructureEvent', async () => {
      const create = jest.fn(async () => ({ id: typeId, code: 'division', name: 'Division' }));
      const eventCreate = jest.fn(async () => ({}));
      const prisma = createPrisma({ departmentType: { create } });
      (prisma as unknown as { orgStructureEvent: { create: jest.Mock } }).orgStructureEvent.create = eventCreate;
      const service = new DepartmentTypesService(prisma);

      await service.createDepartmentType({ organizationId, code: 'division', name: 'Division', sortOrder: 0 }, actorId);

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { organizationId, code: 'division', name: 'Division', sortOrder: 0 } }),
      );
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'department_type.created' }) }),
      );
    });
  });

  describe('updateDepartmentType', () => {
    it('throws NotFoundException for a missing or cross-tenant type', async () => {
      const findFirst = jest.fn(async () => null);
      const prisma = createPrisma({ departmentType: { findFirst } });
      const service = new DepartmentTypesService(prisma);

      await expect(service.updateDepartmentType(typeId, organizationId, { name: 'New' }, actorId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('archiveDepartmentType', () => {
    it('rejects archiving an already-archived type', async () => {
      const findFirst = jest.fn(async () => ({ id: typeId, isActive: false }));
      const prisma = createPrisma({ departmentType: { findFirst } });
      const service = new DepartmentTypesService(prisma);

      await expect(service.archiveDepartmentType(typeId, organizationId, actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('archives an active type', async () => {
      const findFirst = jest.fn(async () => ({ id: typeId, isActive: true }));
      const update = jest.fn(async () => ({ id: typeId, isActive: false }));
      const prisma = createPrisma({ departmentType: { findFirst, update } });
      const service = new DepartmentTypesService(prisma);

      await service.archiveDepartmentType(typeId, organizationId, actorId);

      expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));
    });
  });

  describe('restoreDepartmentType', () => {
    it('rejects restoring a type that is not archived', async () => {
      const findFirst = jest.fn(async () => ({ id: typeId, isActive: true }));
      const prisma = createPrisma({ departmentType: { findFirst } });
      const service = new DepartmentTypesService(prisma);

      await expect(service.restoreDepartmentType(typeId, organizationId, actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('restores an archived type', async () => {
      const findFirst = jest.fn(async () => ({ id: typeId, isActive: false }));
      const update = jest.fn(async () => ({ id: typeId, isActive: true }));
      const prisma = createPrisma({ departmentType: { findFirst, update } });
      const service = new DepartmentTypesService(prisma);

      await service.restoreDepartmentType(typeId, organizationId, actorId);

      expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: true } }));
    });
  });
});
