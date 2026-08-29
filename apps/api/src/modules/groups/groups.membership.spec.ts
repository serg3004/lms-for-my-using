import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';
import { GroupsService } from './groups.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const groupId = '22222222-2222-2222-2222-222222222222';
const userId = '33333333-3333-3333-3333-333333333333';
const managerId = '44444444-4444-4444-4444-444444444444';

const adminActor: TeamScopeActor = { id: 'admin-1', organizationId, roles: ['admin'] };
const managerActor: TeamScopeActor = { id: managerId, organizationId, roles: ['manager'] };

describe('GroupsService membership', () => {
  it('adds a member by upserting so re-adding a removed member clears deletedAt instead of failing', async () => {
    const upsert = jest.fn(async () => ({}));
    const findMany = jest.fn(async () => []);
    const prisma = {
      group: { findFirst: async () => ({ id: groupId }) },
      user: { findFirst: async () => ({ id: userId }) },
      groupMember: { upsert, findMany },
    } as unknown as PrismaService;
    const service = new GroupsService(prisma);

    await service.addMember(groupId, organizationId, { userId }, adminActor);

    expect(upsert).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId, userId } },
      create: { groupId, userId, organizationId },
      update: { deletedAt: null },
    });
  });

  it('rejects adding a member who does not exist in the organization', async () => {
    const prisma = {
      group: { findFirst: async () => ({ id: groupId }) },
      user: { findFirst: async () => null },
    } as unknown as PrismaService;
    const service = new GroupsService(prisma);

    await expect(service.addMember(groupId, organizationId, { userId }, adminActor)).rejects.toThrow(NotFoundException);
  });

  it('removes a member by soft-deleting the row rather than deleting it', async () => {
    const update = jest.fn(async () => ({}));
    const findMany = jest.fn(async () => []);
    const prisma = {
      group: { findFirst: async () => ({ id: groupId }) },
      groupMember: {
        findFirst: async () => ({ groupId, userId }),
        update,
        findMany,
      },
    } as unknown as PrismaService;
    const service = new GroupsService(prisma);

    await service.removeMember(groupId, organizationId, userId, adminActor);

    expect(update).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId, userId } },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('throws when removing a member who is already removed or was never a member', async () => {
    const prisma = {
      group: { findFirst: async () => ({ id: groupId }) },
      groupMember: { findFirst: async () => null },
    } as unknown as PrismaService;
    const service = new GroupsService(prisma);

    await expect(service.removeMember(groupId, organizationId, userId, adminActor)).rejects.toThrow(NotFoundException);
  });

  it('adds a manager by upserting so re-assigning a removed manager clears deletedAt', async () => {
    const upsert = jest.fn(async () => ({}));
    const findMany = jest.fn(async () => []);
    const prisma = {
      group: { findFirst: async () => ({ id: groupId }) },
      user: { findFirst: async () => ({ id: userId }) },
      managerGroup: { upsert, findMany },
    } as unknown as PrismaService;
    const service = new GroupsService(prisma);

    await service.addManager(groupId, organizationId, { managerId: userId }, adminActor);

    expect(upsert).toHaveBeenCalledWith({
      where: { groupId_managerId: { groupId, managerId: userId } },
      create: { groupId, managerId: userId, organizationId },
      update: { deletedAt: null },
    });
  });

  it('removes a manager by soft-deleting the row rather than deleting it', async () => {
    const update = jest.fn(async () => ({}));
    const findMany = jest.fn(async () => []);
    const prisma = {
      group: { findFirst: async () => ({ id: groupId }) },
      managerGroup: {
        findFirst: async () => ({ groupId, managerId: userId }),
        update,
        findMany,
      },
    } as unknown as PrismaService;
    const service = new GroupsService(prisma);

    await service.removeManager(groupId, organizationId, userId, adminActor);

    expect(update).toHaveBeenCalledWith({
      where: { groupId_managerId: { groupId, managerId: userId } },
      data: { deletedAt: expect.any(Date) },
    });
  });

  describe('manager object scope (SEC-GROUP-001)', () => {
    it('rejects a manager adding a member to a group they do not manage, even in the same organization', async () => {
      const findFirst = jest.fn(async () => null);
      const upsert = jest.fn(async () => ({}));
      const prisma = {
        group: { findFirst },
        user: { findFirst: async () => ({ id: userId }) },
        groupMember: { upsert },
      } as unknown as PrismaService;
      const service = new GroupsService(prisma);

      await expect(service.addMember(groupId, organizationId, { userId }, managerActor)).rejects.toThrow(
        NotFoundException,
      );
      expect(upsert).not.toHaveBeenCalled();
      expect(findFirst).toHaveBeenCalledWith({
        where: {
          id: groupId,
          organizationId,
          status: 'active',
          deletedAt: null,
          managers: { some: { managerId: managerActor.id, organizationId, deletedAt: null } },
        },
        select: { id: true },
      });
    });

    it('rejects a manager removing a member from a group they do not manage', async () => {
      const groupFindFirst = jest.fn(async () => null);
      const memberUpdate = jest.fn(async () => ({}));
      const prisma = {
        group: { findFirst: groupFindFirst },
        groupMember: { findFirst: async () => ({ groupId, userId }), update: memberUpdate },
      } as unknown as PrismaService;
      const service = new GroupsService(prisma);

      await expect(service.removeMember(groupId, organizationId, userId, managerActor)).rejects.toThrow(
        NotFoundException,
      );
      expect(memberUpdate).not.toHaveBeenCalled();
    });

    it('rejects a manager assigning themselves to any group before reading or writing scope data', async () => {
      const groupFindFirst = jest.fn(async () => ({ id: groupId }));
      const userFindFirst = jest.fn(async () => ({ id: managerId }));
      const upsert = jest.fn(async () => ({}));
      const prisma = {
        group: { findFirst: groupFindFirst },
        user: { findFirst: userFindFirst },
        managerGroup: { upsert },
      } as unknown as PrismaService;
      const service = new GroupsService(prisma);

      await expect(
        service.addManager(groupId, organizationId, { managerId }, managerActor),
      ).rejects.toThrow(ForbiddenException);
      expect(groupFindFirst).not.toHaveBeenCalled();
      expect(userFindFirst).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
    });

    it('rejects a manager changing the manager set of a group they already manage', async () => {
      const groupFindFirst = jest.fn(async () => ({ id: groupId }));
      const managerFindFirst = jest.fn(async () => ({ groupId, managerId: userId }));
      const update = jest.fn(async () => ({}));
      const prisma = {
        group: { findFirst: groupFindFirst },
        managerGroup: { findFirst: managerFindFirst, update },
      } as unknown as PrismaService;
      const service = new GroupsService(prisma);

      await expect(service.removeManager(groupId, organizationId, userId, managerActor)).rejects.toThrow(
        ForbiddenException,
      );
      expect(groupFindFirst).not.toHaveBeenCalled();
      expect(managerFindFirst).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('allows a manager to add a member to a group they do manage', async () => {
      const upsert = jest.fn(async () => ({}));
      const findMany = jest.fn(async () => []);
      const prisma = {
        group: { findFirst: async () => ({ id: groupId }) },
        user: { findFirst: async () => ({ id: userId }) },
        groupMember: { upsert, findMany },
      } as unknown as PrismaService;
      const service = new GroupsService(prisma);

      await service.addMember(groupId, organizationId, { userId }, managerActor);

      expect(upsert).toHaveBeenCalledWith({
        where: { groupId_userId: { groupId, userId } },
        create: { groupId, userId, organizationId },
        update: { deletedAt: null },
      });
    });
  });
});
