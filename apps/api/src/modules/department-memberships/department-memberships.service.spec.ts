import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { DepartmentMembershipsService } from './department-memberships.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const departmentId = '22222222-2222-2222-2222-222222222222';
const otherDepartmentId = '33333333-3333-3333-3333-333333333333';
const userId = '44444444-4444-4444-4444-444444444444';
const actorId = '55555555-5555-5555-5555-555555555555';
const membershipId = '66666666-6666-6666-6666-666666666666';
const missingUserId = '88888888-8888-8888-8888-888888888888';
const positionId = '99999999-9999-9999-9999-999999999999';

function primaryConflictError() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target: ['department_memberships_current_primary_user_key'] },
  });
}

function departmentConflictError() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target: ['department_memberships_current_user_department_key'] },
  });
}

/**
 * A single object plays both the top-level PrismaService and the transaction client, same
 * convention as departments.service.spec.ts. Real partial-unique-index enforcement and true
 * concurrent-transfer behavior are covered separately by the database integration spec.
 */
function createPrisma(overrides: {
  department?: Partial<Record<'findFirst', jest.Mock>>;
  user?: Partial<Record<'findFirst' | 'findMany', jest.Mock>>;
  departmentMembership?: Partial<Record<'findFirst' | 'findMany' | 'count' | 'create' | 'update', jest.Mock>>;
  position?: Partial<Record<'findFirst', jest.Mock>>;
} = {}) {
  const base: Record<string, unknown> = {
    department: {
      findFirst: jest.fn(async () => ({ id: departmentId, status: 'active' })),
      ...overrides.department,
    },
    user: {
      findFirst: jest.fn(async () => ({ id: userId, status: 'active' })),
      findMany: jest.fn(async () => [{ id: userId, status: 'active' }]),
      ...overrides.user,
    },
    departmentMembership: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      create: jest.fn(async () => ({ id: membershipId })),
      update: jest.fn(async () => ({ id: membershipId })),
      ...overrides.departmentMembership,
    },
    position: {
      findFirst: jest.fn(async () => ({ id: positionId, status: 'active' })),
      ...overrides.position,
    },
    orgStructureEvent: { create: jest.fn(async () => ({})) },
  };
  base['$transaction'] = jest.fn(async (fn: (tx: unknown) => unknown) => fn(base));
  return base as unknown as PrismaService;
}

describe('DepartmentMembershipsService', () => {
  describe('listDepartmentUsers', () => {
    it('throws NotFoundException for a missing or cross-tenant department', async () => {
      const prisma = createPrisma({ department: { findFirst: jest.fn(async () => null) } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(
        service.listDepartmentUsers(departmentId, organizationId, { page: 1, pageSize: 20 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lists only current memberships, primary first', async () => {
      const findMany = jest.fn(async () => []);
      const prisma = createPrisma({ departmentMembership: { findMany } });
      const service = new DepartmentMembershipsService(prisma);

      const result = await service.listDepartmentUsers(departmentId, organizationId, { page: 1, pageSize: 20 });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { departmentId, organizationId, effectiveTo: null },
          orderBy: [{ isPrimary: 'desc' }, { effectiveFrom: 'asc' }, { id: 'asc' }],
          skip: 0,
          take: 20,
        }),
      );
      expect(result).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
    });

    it('filters by search across first name, last name, and email', async () => {
      const findMany = jest.fn(async () => []);
      const count = jest.fn(async () => 0);
      const prisma = createPrisma({ departmentMembership: { findMany, count } });
      const service = new DepartmentMembershipsService(prisma);

      await service.listDepartmentUsers(departmentId, organizationId, { page: 2, pageSize: 10, search: 'ann' });

      const expectedWhere = {
        departmentId,
        organizationId,
        effectiveTo: null,
        user: {
          OR: [
            { firstName: { contains: 'ann', mode: 'insensitive' } },
            { lastName: { contains: 'ann', mode: 'insensitive' } },
            { email: { contains: 'ann', mode: 'insensitive' } },
          ],
        },
      };
      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere, skip: 10, take: 10 }));
      expect(count).toHaveBeenCalledWith({ where: expectedWhere });
    });
  });

  describe('listUserMemberships', () => {
    it('throws NotFoundException for a missing or cross-tenant user', async () => {
      const prisma = createPrisma({ user: { findFirst: jest.fn(async () => null) } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(service.listUserMemberships(userId, organizationId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lists full history ordered newest first', async () => {
      const findMany = jest.fn(async () => []);
      const prisma = createPrisma({ departmentMembership: { findMany } });
      const service = new DepartmentMembershipsService(prisma);

      await service.listUserMemberships(userId, organizationId);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId, organizationId }, orderBy: [{ effectiveFrom: 'desc' }] }),
      );
    });
  });

  describe('createMembership', () => {
    it('rejects a cross-tenant or missing department', async () => {
      const prisma = createPrisma({ department: { findFirst: jest.fn(async () => null) } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(
        service.createMembership({ organizationId, departmentId, userId, isPrimary: true }, actorId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects assignment to an archived department', async () => {
      const prisma = createPrisma({ department: { findFirst: jest.fn(async () => ({ id: departmentId, status: 'archived' })) } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(
        service.createMembership({ organizationId, departmentId, userId, isPrimary: true }, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects an inactive user', async () => {
      const prisma = createPrisma({ user: { findFirst: jest.fn(async () => ({ id: userId, status: 'suspended' })) } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(
        service.createMembership({ organizationId, departmentId, userId, isPrimary: true }, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('maps a duplicate-primary unique violation to a clear conflict', async () => {
      const create = jest.fn(async () => { throw primaryConflictError(); });
      const prisma = createPrisma({ departmentMembership: { create } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(
        service.createMembership({ organizationId, departmentId, userId, isPrimary: true }, actorId),
      ).rejects.toMatchObject({ message: expect.stringContaining('primary') });
    });

    it('maps a duplicate-current-department unique violation to a clear conflict', async () => {
      const create = jest.fn(async () => { throw departmentConflictError(); });
      const prisma = createPrisma({ departmentMembership: { create } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(
        service.createMembership({ organizationId, departmentId, userId, isPrimary: false }, actorId),
      ).rejects.toMatchObject({ message: expect.stringContaining('membership in this department') });
    });

    it('creates an additional (non-primary) membership and records an event', async () => {
      const create = jest.fn(async () => ({ id: membershipId, isPrimary: false }));
      const eventCreate = jest.fn(async () => ({}));
      const prisma = createPrisma({ departmentMembership: { create } });
      (prisma as unknown as { orgStructureEvent: { create: jest.Mock } }).orgStructureEvent.create = eventCreate;
      const service = new DepartmentMembershipsService(prisma);

      await service.createMembership({ organizationId, departmentId, userId, isPrimary: false }, actorId);

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { organizationId, departmentId, userId, isPrimary: false, positionId: null } }),
      );
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'department_membership.created' }) }),
      );
    });

    it('rejects a cross-tenant or missing position', async () => {
      const prisma = createPrisma({ position: { findFirst: jest.fn(async () => null) } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(
        service.createMembership({ organizationId, departmentId, userId, isPrimary: true, positionId }, actorId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects assigning an archived position', async () => {
      const prisma = createPrisma({ position: { findFirst: jest.fn(async () => ({ id: positionId, status: 'archived' })) } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(
        service.createMembership({ organizationId, departmentId, userId, isPrimary: true, positionId }, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('persists an active position on the created membership', async () => {
      const create = jest.fn(async () => ({ id: membershipId, isPrimary: true, positionId }));
      const prisma = createPrisma({ departmentMembership: { create } });
      const service = new DepartmentMembershipsService(prisma);

      await service.createMembership({ organizationId, departmentId, userId, isPrimary: true, positionId }, actorId);

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ positionId }) }),
      );
    });
  });

  describe('closeMembership', () => {
    it('throws NotFoundException for a missing or cross-tenant membership', async () => {
      const prisma = createPrisma({ departmentMembership: { findFirst: jest.fn(async () => null) } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(service.closeMembership(membershipId, organizationId, actorId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects closing an already-closed membership', async () => {
      const prisma = createPrisma({
        departmentMembership: { findFirst: jest.fn(async () => ({ id: membershipId, effectiveTo: new Date(), departmentId, userId })) },
      });
      const service = new DepartmentMembershipsService(prisma);

      await expect(service.closeMembership(membershipId, organizationId, actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('closes a current membership and records an event', async () => {
      const update = jest.fn(async () => ({ id: membershipId, effectiveTo: new Date() }));
      const eventCreate = jest.fn(async () => ({}));
      const prisma = createPrisma({
        departmentMembership: {
          findFirst: jest.fn(async () => ({ id: membershipId, effectiveTo: null, departmentId, userId })),
          update,
        },
      });
      (prisma as unknown as { orgStructureEvent: { create: jest.Mock } }).orgStructureEvent.create = eventCreate;
      const service = new DepartmentMembershipsService(prisma);

      await service.closeMembership(membershipId, organizationId, actorId);

      expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: membershipId }, data: { effectiveTo: expect.any(Date) } }));
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'department_membership.closed' }) }),
      );
    });
  });

  describe('transferPrimaryDepartment', () => {
    it('rejects transferring into an archived department', async () => {
      const prisma = createPrisma({ department: { findFirst: jest.fn(async () => ({ id: departmentId, status: 'archived' })) } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(
        service.transferPrimaryDepartment(userId, organizationId, { departmentId }, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects transferring an inactive user', async () => {
      const prisma = createPrisma({ user: { findFirst: jest.fn(async () => ({ id: userId, status: 'archived' })) } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(
        service.transferPrimaryDepartment(userId, organizationId, { departmentId }, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a no-op transfer to the same current primary department', async () => {
      const prisma = createPrisma({
        departmentMembership: { findFirst: jest.fn(async () => ({ id: membershipId, departmentId })) },
      });
      const service = new DepartmentMembershipsService(prisma);

      await expect(
        service.transferPrimaryDepartment(userId, organizationId, { departmentId }, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('closes the old primary and creates a new one when a current primary exists', async () => {
      const update = jest.fn(async () => ({}));
      const create = jest.fn(async () => ({ id: membershipId, departmentId, isPrimary: true }));
      const eventCreate = jest.fn(async () => ({}));
      const prisma = createPrisma({
        departmentMembership: {
          findFirst: jest.fn(async () => ({ id: 'old-membership', departmentId: otherDepartmentId })),
          update,
          create,
        },
      });
      (prisma as unknown as { orgStructureEvent: { create: jest.Mock } }).orgStructureEvent.create = eventCreate;
      const service = new DepartmentMembershipsService(prisma);

      await service.transferPrimaryDepartment(userId, organizationId, { departmentId }, actorId);

      expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'old-membership' }, data: { effectiveTo: expect.any(Date) } }));
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ departmentId, userId, isPrimary: true }) }),
      );
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'department_membership.transferred',
            metadata: { fromDepartmentId: otherDepartmentId, toDepartmentId: departmentId, userId, positionId: null },
          }),
        }),
      );
    });

    it('creates a primary membership directly when the user has none yet', async () => {
      const create = jest.fn(async () => ({ id: membershipId, departmentId, isPrimary: true }));
      const update = jest.fn(async () => ({}));
      const prisma = createPrisma({ departmentMembership: { findFirst: jest.fn(async () => null), create, update } });
      const service = new DepartmentMembershipsService(prisma);

      await service.transferPrimaryDepartment(userId, organizationId, { departmentId }, actorId);

      expect(update).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalled();
    });

    it('rejects transferring with an archived position', async () => {
      const prisma = createPrisma({ position: { findFirst: jest.fn(async () => ({ id: positionId, status: 'archived' })) } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(
        service.transferPrimaryDepartment(userId, organizationId, { departmentId, positionId }, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('persists the given position on the newly created primary membership', async () => {
      const create = jest.fn(async () => ({ id: membershipId, departmentId, isPrimary: true, positionId }));
      const prisma = createPrisma({ departmentMembership: { create } });
      const service = new DepartmentMembershipsService(prisma);

      await service.transferPrimaryDepartment(userId, organizationId, { departmentId, positionId }, actorId);

      expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ positionId }) }));
    });
  });

  describe('bulkTransfer', () => {
    it('rejects a missing or cross-tenant department', async () => {
      const prisma = createPrisma({ department: { findFirst: jest.fn(async () => null) } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(service.bulkTransfer(departmentId, organizationId, { userIds: [userId] }, actorId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects an archived department', async () => {
      const prisma = createPrisma({ department: { findFirst: jest.fn(async () => ({ id: departmentId, status: 'archived' })) } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(service.bulkTransfer(departmentId, organizationId, { userIds: [userId] }, actorId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects when any user is missing (no partial application)', async () => {
      const prisma = createPrisma({ user: { findMany: jest.fn(async () => [{ id: userId, status: 'active' }]) } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(
        service.bulkTransfer(departmentId, organizationId, { userIds: [userId, missingUserId] }, actorId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when any user is inactive', async () => {
      const prisma = createPrisma({ user: { findMany: jest.fn(async () => [{ id: userId, status: 'suspended' }]) } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(service.bulkTransfer(departmentId, organizationId, { userIds: [userId] }, actorId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('transfers every user under one shared operationId and skips a user already there', async () => {
      const alreadyThereUserId = '77777777-7777-7777-7777-777777777777';
      const create = jest.fn(async () => ({ id: membershipId, isPrimary: true }));
      const update = jest.fn(async () => ({}));
      const eventCreate = jest.fn(async () => ({}));
      const findFirst = jest
        .fn()
        // first call: current-primary lookup for `userId` -> none
        .mockResolvedValueOnce(null)
        // second call: current-primary lookup for `alreadyThereUserId` -> already in target department
        .mockResolvedValueOnce({ id: 'existing', departmentId });
      const prisma = createPrisma({
        user: {
          findMany: jest.fn(async () => [
            { id: userId, status: 'active' },
            { id: alreadyThereUserId, status: 'active' },
          ]),
        },
        departmentMembership: { findFirst, create, update },
      });
      (prisma as unknown as { orgStructureEvent: { create: jest.Mock } }).orgStructureEvent.create = eventCreate;
      const service = new DepartmentMembershipsService(prisma);

      const result = await service.bulkTransfer(departmentId, organizationId, { userIds: [userId, alreadyThereUserId] }, actorId);

      expect(create).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      const [[eventArgs]] = eventCreate.mock.calls;
      const operationId = (eventArgs as { data: { operationId: string } }).data.operationId;
      expect(typeof operationId).toBe('string');
    });

    it('rejects a bulk transfer with an archived position', async () => {
      const prisma = createPrisma({ position: { findFirst: jest.fn(async () => ({ id: positionId, status: 'archived' })) } });
      const service = new DepartmentMembershipsService(prisma);

      await expect(
        service.bulkTransfer(departmentId, organizationId, { userIds: [userId], positionId }, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('applies the given position to every transferred membership', async () => {
      const create = jest.fn(async () => ({ id: membershipId, isPrimary: true, positionId }));
      const prisma = createPrisma({ departmentMembership: { create } });
      const service = new DepartmentMembershipsService(prisma);

      await service.bulkTransfer(departmentId, organizationId, { userIds: [userId], positionId }, actorId);

      expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ positionId }) }));
    });
  });
});
