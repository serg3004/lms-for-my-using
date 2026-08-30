import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { DepartmentManagersService } from './department-managers.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const departmentId = '22222222-2222-2222-2222-222222222222';
const userId = '44444444-4444-4444-4444-444444444444';
const actorId = '55555555-5555-5555-5555-555555555555';
const managerId = '66666666-6666-6666-6666-666666666666';

function duplicateManagerError() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target: ['department_managers_current_department_user_type_key'] },
  });
}

function primaryConflictError() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target: ['department_managers_current_primary_type_key'] },
  });
}

/** A single object plays both the top-level PrismaService and the transaction client. */
function createPrisma(overrides: {
  department?: Partial<Record<'findFirst' | 'findMany' | 'update', jest.Mock>>;
  user?: Partial<Record<'findFirst' | 'findMany', jest.Mock>>;
  departmentManager?: Partial<Record<'findFirst' | 'findMany' | 'create' | 'update', jest.Mock>>;
} = {}) {
  const base: Record<string, unknown> = {
    department: {
      findFirst: jest.fn(async () => ({ id: departmentId, status: 'active' })),
      findMany: jest.fn(async () => []),
      update: jest.fn(async () => ({ id: departmentId, organizationId, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' })),
      ...overrides.department,
    },
    user: {
      findFirst: jest.fn(async () => ({ id: userId, status: 'active' })),
      findMany: jest.fn(async () => [{ id: userId, status: 'active' }]),
      ...overrides.user,
    },
    departmentManager: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => ({ id: managerId })),
      update: jest.fn(async () => ({ id: managerId })),
      ...overrides.departmentManager,
    },
    orgStructureEvent: { create: jest.fn(async () => ({})) },
  };
  base['$transaction'] = jest.fn(async (fn: (tx: unknown) => unknown) => fn(base));
  return base as unknown as PrismaService;
}

describe('DepartmentManagersService', () => {
  describe('listEffectiveManagers', () => {
    it('throws NotFoundException for a missing or cross-tenant department', async () => {
      const prisma = createPrisma({ department: { findFirst: jest.fn(async () => null) } });
      const service = new DepartmentManagersService(prisma);

      await expect(service.listEffectiveManagers(departmentId, organizationId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns an empty array when there are no effective managers', async () => {
      const prisma = createPrisma({
        department: {
          findFirst: jest.fn(async () => ({ id: departmentId })),
          findMany: jest.fn(async () => [{ id: departmentId, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' }]),
        },
      });
      (prisma as unknown as { $queryRaw: jest.Mock }).$queryRaw = jest.fn(async () => [{ id: departmentId, lvl: 0 }]);
      const service = new DepartmentManagersService(prisma);

      await expect(service.listEffectiveManagers(departmentId, organizationId)).resolves.toEqual([]);
    });
  });

  describe('createManager', () => {
    it('rejects a cross-tenant or missing department', async () => {
      const prisma = createPrisma({ department: { findFirst: jest.fn(async () => null) } });
      const service = new DepartmentManagersService(prisma);

      await expect(
        service.createManager({ organizationId, departmentId, userId, type: 'DIRECT', isPrimary: false }, actorId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects assignment in an archived department', async () => {
      const prisma = createPrisma({ department: { findFirst: jest.fn(async () => ({ id: departmentId, status: 'archived' })) } });
      const service = new DepartmentManagersService(prisma);

      await expect(
        service.createManager({ organizationId, departmentId, userId, type: 'DIRECT', isPrimary: false }, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects an inactive user', async () => {
      const prisma = createPrisma({ user: { findFirst: jest.fn(async () => ({ id: userId, status: 'suspended' })) } });
      const service = new DepartmentManagersService(prisma);

      await expect(
        service.createManager({ organizationId, departmentId, userId, type: 'DIRECT', isPrimary: false }, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('maps a duplicate current (department, user, type) violation to a clear conflict', async () => {
      const create = jest.fn(async () => { throw duplicateManagerError(); });
      const prisma = createPrisma({ departmentManager: { create } });
      const service = new DepartmentManagersService(prisma);

      await expect(
        service.createManager({ organizationId, departmentId, userId, type: 'DIRECT', isPrimary: false }, actorId),
      ).rejects.toMatchObject({ message: expect.stringContaining('already a current manager') });
    });

    it('maps a duplicate-primary violation to a clear conflict', async () => {
      const create = jest.fn(async () => { throw primaryConflictError(); });
      const prisma = createPrisma({ departmentManager: { create } });
      const service = new DepartmentManagersService(prisma);

      await expect(
        service.createManager({ organizationId, departmentId, userId, type: 'DIRECT', isPrimary: true }, actorId),
      ).rejects.toMatchObject({ message: expect.stringContaining('primary manager') });
    });

    it('creates a manager and records an event; a manager does not need Department membership', async () => {
      const create = jest.fn(async () => ({ id: managerId, type: 'FUNCTIONAL', isPrimary: true }));
      const eventCreate = jest.fn(async () => ({}));
      const prisma = createPrisma({ departmentManager: { create } });
      (prisma as unknown as { orgStructureEvent: { create: jest.Mock } }).orgStructureEvent.create = eventCreate;
      const service = new DepartmentManagersService(prisma);

      await service.createManager({ organizationId, departmentId, userId, type: 'FUNCTIONAL', isPrimary: true }, actorId);

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { organizationId, departmentId, userId, type: 'FUNCTIONAL', isPrimary: true } }),
      );
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'department_manager.created' }) }),
      );
    });
  });

  describe('closeManager', () => {
    it('throws NotFoundException for a missing or cross-tenant manager', async () => {
      const prisma = createPrisma({ departmentManager: { findFirst: jest.fn(async () => null) } });
      const service = new DepartmentManagersService(prisma);

      await expect(service.closeManager(managerId, organizationId, actorId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects closing an already-closed manager', async () => {
      const prisma = createPrisma({
        departmentManager: { findFirst: jest.fn(async () => ({ id: managerId, effectiveTo: new Date(), departmentId, userId, type: 'DIRECT' })) },
      });
      const service = new DepartmentManagersService(prisma);

      await expect(service.closeManager(managerId, organizationId, actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('closes a current manager and records an event', async () => {
      const update = jest.fn(async () => ({ id: managerId, effectiveTo: new Date() }));
      const eventCreate = jest.fn(async () => ({}));
      const prisma = createPrisma({
        departmentManager: {
          findFirst: jest.fn(async () => ({ id: managerId, effectiveTo: null, departmentId, userId, type: 'DIRECT' })),
          update,
        },
      });
      (prisma as unknown as { orgStructureEvent: { create: jest.Mock } }).orgStructureEvent.create = eventCreate;
      const service = new DepartmentManagersService(prisma);

      await service.closeManager(managerId, organizationId, actorId);

      expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: managerId }, data: { effectiveTo: expect.any(Date) } }));
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'department_manager.closed' }) }),
      );
    });
  });

  describe('updateManagerModes', () => {
    it('throws NotFoundException for a missing or cross-tenant department', async () => {
      const prisma = createPrisma({ department: { findFirst: jest.fn(async () => null) } });
      const service = new DepartmentManagersService(prisma);

      await expect(
        service.updateManagerModes(departmentId, organizationId, { directManagerMode: 'INHERIT' }, actorId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects switching to INHERIT while current local managers of that type exist', async () => {
      const prisma = createPrisma({
        departmentManager: { findFirst: jest.fn(async () => ({ id: managerId })) },
      });
      const service = new DepartmentManagersService(prisma);

      await expect(
        service.updateManagerModes(departmentId, organizationId, { directManagerMode: 'INHERIT' }, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows switching to INHERIT when no current local managers of that type exist', async () => {
      const update = jest.fn(async () => ({ id: departmentId, organizationId, directManagerMode: 'INHERIT', functionalManagerMode: 'LOCAL' }));
      const eventCreate = jest.fn(async () => ({}));
      const prisma = createPrisma({
        departmentManager: { findFirst: jest.fn(async () => null) },
        department: { findFirst: jest.fn(async () => ({ id: departmentId, status: 'active' })), update },
      });
      (prisma as unknown as { orgStructureEvent: { create: jest.Mock } }).orgStructureEvent.create = eventCreate;
      const service = new DepartmentManagersService(prisma);

      await service.updateManagerModes(departmentId, organizationId, { directManagerMode: 'INHERIT' }, actorId);

      expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: departmentId }, data: { directManagerMode: 'INHERIT' } }));
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'department.manager_modes_updated' }) }),
      );
    });

    it('allows switching to LOCAL or MERGE even with current local managers', async () => {
      const update = jest.fn(async () => ({ id: departmentId, organizationId, directManagerMode: 'MERGE', functionalManagerMode: 'LOCAL' }));
      const prisma = createPrisma({
        departmentManager: { findFirst: jest.fn(async () => ({ id: managerId })) },
        department: { findFirst: jest.fn(async () => ({ id: departmentId, status: 'active' })), update },
      });
      const service = new DepartmentManagersService(prisma);

      await service.updateManagerModes(departmentId, organizationId, { directManagerMode: 'MERGE' }, actorId);

      expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { directManagerMode: 'MERGE' } }));
    });

    it('checks each provided mode field independently', async () => {
      const findFirst = jest
        .fn()
        // direct check: no local DIRECT managers
        .mockResolvedValueOnce(null)
        // functional check: has a local FUNCTIONAL manager
        .mockResolvedValueOnce({ id: managerId });
      const prisma = createPrisma({ departmentManager: { findFirst } });
      const service = new DepartmentManagersService(prisma);

      await expect(
        service.updateManagerModes(
          departmentId,
          organizationId,
          { directManagerMode: 'INHERIT', functionalManagerMode: 'INHERIT' },
          actorId,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
