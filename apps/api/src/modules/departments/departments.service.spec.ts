import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { DepartmentsService } from './departments.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const otherOrganizationId = '99999999-9999-9999-9999-999999999999';
const departmentId = '22222222-2222-2222-2222-222222222222';
const parentId = '33333333-3333-3333-3333-333333333333';
const actorId = '44444444-4444-4444-4444-444444444444';

/**
 * A single object plays both the top-level PrismaService and the transaction client
 * handed to callbacks — `$transaction` just invokes the callback with this same object,
 * which is enough for unit-level branch coverage. Real recursive-CTE traversal and true
 * concurrent-transaction behavior are covered separately by the database integration spec.
 */
function createPrisma(overrides: {
  department?: Partial<Record<'findFirst' | 'findMany' | 'count' | 'create' | 'update', jest.Mock>>;
  departmentType?: Partial<Record<'findFirst', jest.Mock>>;
  queryRaw?: jest.Mock;
} = {}) {
  const base: Record<string, unknown> = {
    department: {
      findFirst: jest.fn(),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      create: jest.fn(),
      update: jest.fn(),
      ...overrides.department,
    },
    departmentType: {
      findFirst: jest.fn(),
      ...overrides.departmentType,
    },
    orgStructureEvent: { create: jest.fn(async () => ({})) },
    $queryRaw: overrides.queryRaw ?? jest.fn(async () => []),
  };
  base['$transaction'] = jest.fn(async (fn: (tx: unknown) => unknown) => fn(base));
  return base as unknown as PrismaService;
}

describe('DepartmentsService', () => {
  describe('listDepartments', () => {
    it('paginates and applies search/type/status filters', async () => {
      const findMany = jest.fn(async () => []);
      const count = jest.fn(async () => 0);
      const prisma = createPrisma({ department: { findMany, count } });
      const service = new DepartmentsService(prisma);

      await service.listDepartments(organizationId, { page: 2, pageSize: 10, search: 'eng', departmentTypeId: parentId, status: 'active' });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId,
            status: 'active',
            departmentTypeId: parentId,
            OR: [
              { name: { contains: 'eng', mode: 'insensitive' } },
              { code: { contains: 'eng', mode: 'insensitive' } },
            ],
          },
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('getTree', () => {
    it('lists only active roots by default', async () => {
      const findMany = jest.fn(async () => []);
      const prisma = createPrisma({ department: { findMany } });
      const service = new DepartmentsService(prisma);

      await service.getTree(organizationId);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId, parentId: null, status: 'active' } }),
      );
    });

    it('allows explicitly listing archived roots', async () => {
      const findMany = jest.fn(async () => []);
      const prisma = createPrisma({ department: { findMany } });
      const service = new DepartmentsService(prisma);

      await service.getTree(organizationId, 'archived');

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId, parentId: null, status: 'archived' } }),
      );
    });

    it('batches headcounts for every root in one raw query each, not one per department', async () => {
      const secondId = '55555555-5555-5555-5555-555555555555';
      const findMany = jest.fn(async () => [{ id: departmentId }, { id: secondId }]);
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce([{ id: departmentId, count: 2n }])
        .mockResolvedValueOnce([{ id: departmentId, count: 5n }, { id: secondId, count: 1n }]);
      const prisma = createPrisma({ department: { findMany }, queryRaw });
      const service = new DepartmentsService(prisma);

      const roots = await service.getTree(organizationId);

      expect(queryRaw).toHaveBeenCalledTimes(2);
      expect(roots).toMatchObject([
        { id: departmentId, directUserCount: 2, subtreeUserCount: 5 },
        { id: secondId, directUserCount: 0, subtreeUserCount: 1 },
      ]);
    });
  });

  describe('getDepartment', () => {
    it('throws NotFoundException for a missing or cross-tenant department', async () => {
      const prisma = createPrisma({ department: { findFirst: jest.fn(async () => null) } });
      const service = new DepartmentsService(prisma);

      await expect(service.getDepartment(departmentId, organizationId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('attaches direct and subtree headcounts from the batched raw queries, defaulting to 0 when absent', async () => {
      const findFirst = jest.fn(async () => ({ id: departmentId }));
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce([{ id: departmentId, count: 3n }])
        .mockResolvedValueOnce([]);
      const prisma = createPrisma({ department: { findFirst }, queryRaw });
      const service = new DepartmentsService(prisma);

      const result = await service.getDepartment(departmentId, organizationId);

      expect(result).toMatchObject({ id: departmentId, directUserCount: 3, subtreeUserCount: 0 });
    });
  });

  describe('getChildren', () => {
    it('rejects when the parent department does not exist in this tenant', async () => {
      const prisma = createPrisma({ department: { findFirst: jest.fn(async () => null) } });
      const service = new DepartmentsService(prisma);

      await expect(service.getChildren(departmentId, organizationId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lists only active children by default, tenant-scoped', async () => {
      const findFirst = jest.fn(async () => ({ id: departmentId }));
      const findMany = jest.fn(async () => []);
      const prisma = createPrisma({ department: { findFirst, findMany } });
      const service = new DepartmentsService(prisma);

      await service.getChildren(departmentId, organizationId);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId, parentId: departmentId, status: 'active' } }),
      );
    });
  });

  describe('getPath', () => {
    it('returns the ancestor chain root-first, including the department itself', async () => {
      const rootId = 'root-id';
      const findFirst = jest.fn(async () => ({ id: departmentId }));
      const queryRaw = jest.fn(async () => [
        { id: rootId, lvl: 1 },
        { id: departmentId, lvl: 0 },
      ]);
      const findMany = jest.fn(async () => [
        { id: departmentId, name: 'Child' },
        { id: rootId, name: 'Root' },
      ]);
      const prisma = createPrisma({ department: { findFirst, findMany }, queryRaw });
      const service = new DepartmentsService(prisma);

      const path = await service.getPath(departmentId, organizationId);

      expect(path.map((d) => d.id)).toEqual([rootId, departmentId]);
    });
  });

  describe('createDepartment', () => {
    it('creates a root department at depth 1 when no parent is given', async () => {
      const create = jest.fn(async () => ({ id: departmentId, name: 'Root', parentId: null, departmentTypeId: null }));
      const prisma = createPrisma({ department: { create } });
      const service = new DepartmentsService(prisma);

      await service.createDepartment(
        { organizationId, name: 'Root', sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
        actorId,
      );

      expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ parentId: null }) }));
    });

    it('rejects a parent from a different tenant', async () => {
      const findFirst = jest.fn(async () => null);
      const prisma = createPrisma({ department: { findFirst } });
      const service = new DepartmentsService(prisma);

      await expect(
        service.createDepartment(
          { organizationId, parentId, name: 'Child', sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
          actorId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an archived parent', async () => {
      const findFirst = jest.fn(async () => ({ id: parentId, status: 'archived' }));
      const prisma = createPrisma({ department: { findFirst } });
      const service = new DepartmentsService(prisma);

      await expect(
        service.createDepartment(
          { organizationId, parentId, name: 'Child', sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
          actorId,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects creation that would exceed the maximum depth', async () => {
      const findFirst = jest.fn(async () => ({ id: parentId, status: 'active' }));
      const queryRaw = jest.fn(async () => [{ lvl: 31 }]); // parent depth = 32 -> child would be 33
      const prisma = createPrisma({ department: { findFirst }, queryRaw });
      const service = new DepartmentsService(prisma);

      await expect(
        service.createDepartment(
          { organizationId, parentId, name: 'Too deep', sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
          actorId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a department type from a different tenant', async () => {
      const findFirst = jest.fn(async () => null);
      const prisma = createPrisma({ departmentType: { findFirst } });
      const service = new DepartmentsService(prisma);

      await expect(
        service.createDepartment(
          {
            organizationId,
            departmentTypeId: 'foreign-type',
            name: 'Root',
            sortOrder: 0,
            directManagerMode: 'LOCAL',
            functionalManagerMode: 'LOCAL',
          },
          actorId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('records an OrgStructureEvent in the same transaction', async () => {
      const create = jest.fn(async () => ({ id: departmentId, name: 'Root', parentId: null, departmentTypeId: null }));
      const eventCreate = jest.fn(async () => ({}));
      const prisma = createPrisma({ department: { create } });
      (prisma as unknown as { orgStructureEvent: { create: jest.Mock } }).orgStructureEvent.create = eventCreate;
      const service = new DepartmentsService(prisma);

      await service.createDepartment(
        { organizationId, name: 'Root', sortOrder: 0, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
        actorId,
      );

      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId, actorId, entityType: 'department', eventType: 'department.created' }),
        }),
      );
    });
  });

  describe('moveDepartment', () => {
    it('rejects a department becoming its own parent without any lookup', async () => {
      const findFirst = jest.fn(async () => ({ id: departmentId, parentId: null }));
      const queryRaw = jest.fn(async () => []);
      const prisma = createPrisma({ department: { findFirst }, queryRaw });
      const service = new DepartmentsService(prisma);

      await expect(service.moveDepartment(departmentId, organizationId, { parentId: departmentId }, actorId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('rejects moving under a department from a different tenant', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce({ id: departmentId, parentId: null })
        .mockResolvedValueOnce(null);
      const prisma = createPrisma({ department: { findFirst } });
      const service = new DepartmentsService(prisma);

      await expect(service.moveDepartment(departmentId, organizationId, { parentId }, actorId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects moving under an archived department', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce({ id: departmentId, parentId: null })
        .mockResolvedValueOnce({ id: parentId, status: 'archived' });
      const prisma = createPrisma({ department: { findFirst } });
      const service = new DepartmentsService(prisma);

      await expect(service.moveDepartment(departmentId, organizationId, { parentId }, actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects moving a department under one of its own descendants (cycle)', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce({ id: departmentId, parentId: null })
        .mockResolvedValueOnce({ id: parentId, status: 'active' });
      // isSelfOrDescendant's query: the candidate id shows up in the target's subtree.
      const queryRaw = jest.fn(async () => [{ id: parentId }]);
      const prisma = createPrisma({ department: { findFirst }, queryRaw });
      const service = new DepartmentsService(prisma);

      await expect(service.moveDepartment(departmentId, organizationId, { parentId }, actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a move that would push the subtree past the maximum depth', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce({ id: departmentId, parentId: null })
        .mockResolvedValueOnce({ id: parentId, status: 'active' });
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce([]) // isSelfOrDescendant: no cycle
        .mockResolvedValueOnce([{ lvl: 5 }]) // subtree height: moved subtree is 6 levels tall
        .mockResolvedValueOnce([{ lvl: 27 }]); // new parent depth = 28
      const prisma = createPrisma({ department: { findFirst }, queryRaw });
      const service = new DepartmentsService(prisma);

      // newSelfDepth = 29, + subtreeHeight 5 = 34 > 32
      await expect(service.moveDepartment(departmentId, organizationId, { parentId }, actorId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('moves a department to become a root when parentId is null', async () => {
      const findFirst = jest.fn(async () => ({ id: departmentId, parentId: 'old-parent' }));
      const update = jest.fn(async () => ({ id: departmentId, parentId: null }));
      const queryRaw = jest.fn().mockResolvedValueOnce([{ lvl: 0 }]); // subtree height only
      const prisma = createPrisma({ department: { findFirst, update }, queryRaw });
      const service = new DepartmentsService(prisma);

      await service.moveDepartment(departmentId, organizationId, { parentId: null }, actorId);

      expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { parentId: null } }));
      expect(queryRaw).toHaveBeenCalledTimes(1);
    });

    it('records an OrgStructureEvent capturing the previous and new parent', async () => {
      const findFirst = jest.fn(async () => ({ id: departmentId, parentId: 'old-parent' }));
      const update = jest.fn(async () => ({ id: departmentId, parentId: null }));
      const eventCreate = jest.fn(async () => ({}));
      const queryRaw = jest.fn().mockResolvedValueOnce([{ lvl: 0 }]);
      const prisma = createPrisma({ department: { findFirst, update }, queryRaw });
      (prisma as unknown as { orgStructureEvent: { create: jest.Mock } }).orgStructureEvent.create = eventCreate;
      const service = new DepartmentsService(prisma);

      await service.moveDepartment(departmentId, organizationId, { parentId: null }, actorId);

      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'department.moved',
            metadata: { fromParentId: 'old-parent', toParentId: null },
          }),
        }),
      );
    });
  });

  describe('archiveDepartment', () => {
    it('rejects archiving an already-archived department', async () => {
      const findFirst = jest.fn(async () => ({ id: departmentId, status: 'archived' }));
      const prisma = createPrisma({ department: { findFirst } });
      const service = new DepartmentsService(prisma);

      await expect(service.archiveDepartment(departmentId, organizationId, actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects archiving a department that has an active child', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce({ id: departmentId, status: 'active' })
        .mockResolvedValueOnce({ id: 'child-id' });
      const prisma = createPrisma({ department: { findFirst } });
      const service = new DepartmentsService(prisma);

      await expect(service.archiveDepartment(departmentId, organizationId, actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('archives a department with no active children', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce({ id: departmentId, status: 'active' })
        .mockResolvedValueOnce(null);
      const update = jest.fn(async () => ({ id: departmentId, status: 'archived' }));
      const prisma = createPrisma({ department: { findFirst, update } });
      const service = new DepartmentsService(prisma);

      await service.archiveDepartment(departmentId, organizationId, actorId);

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'archived' }) }),
      );
    });
  });

  describe('restoreDepartment', () => {
    it('rejects restoring a department that is not archived', async () => {
      const findFirst = jest.fn(async () => ({ id: departmentId, status: 'active', parentId: null }));
      const prisma = createPrisma({ department: { findFirst } });
      const service = new DepartmentsService(prisma);

      await expect(service.restoreDepartment(departmentId, organizationId, actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects restoring when the stored parent is archived', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce({ id: departmentId, status: 'archived', parentId })
        .mockResolvedValueOnce({ id: parentId, status: 'archived' });
      const prisma = createPrisma({ department: { findFirst } });
      const service = new DepartmentsService(prisma);

      await expect(service.restoreDepartment(departmentId, organizationId, actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects restoring when the stored parent no longer exists in this tenant', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce({ id: departmentId, status: 'archived', parentId })
        .mockResolvedValueOnce(null);
      const prisma = createPrisma({ department: { findFirst } });
      const service = new DepartmentsService(prisma);

      await expect(service.restoreDepartment(departmentId, organizationId, actorId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('restores a root department with no parent to check', async () => {
      const findFirst = jest.fn(async () => ({ id: departmentId, status: 'archived', parentId: null }));
      const update = jest.fn(async () => ({ id: departmentId, status: 'active' }));
      const queryRaw = jest.fn().mockResolvedValueOnce([{ lvl: 0 }]); // subtree height
      const prisma = createPrisma({ department: { findFirst, update }, queryRaw });
      const service = new DepartmentsService(prisma);

      await service.restoreDepartment(departmentId, organizationId, actorId);

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'active', archivedAt: null } }),
      );
    });
  });

  it('rejects a cross-tenant department id as not found rather than leaking existence', async () => {
    const findFirst = jest.fn(async () => null);
    const prisma = createPrisma({ department: { findFirst } });
    const service = new DepartmentsService(prisma);

    await expect(service.getDepartment(departmentId, otherOrganizationId)).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: departmentId, organizationId: otherOrganizationId } }));
  });
});
