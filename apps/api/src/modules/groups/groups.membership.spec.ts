import { NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../../database/prisma.service.js';
import { GroupsService } from './groups.service.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const groupId = '22222222-2222-2222-2222-222222222222';
const userId = '33333333-3333-3333-3333-333333333333';

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

    await service.addMember(groupId, organizationId, { userId });

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

    await expect(service.addMember(groupId, organizationId, { userId })).rejects.toThrow(NotFoundException);
  });

  it('removes a member by soft-deleting the row rather than deleting it', async () => {
    const update = jest.fn(async () => ({}));
    const findMany = jest.fn(async () => []);
    const prisma = {
      groupMember: {
        findFirst: async () => ({ groupId, userId }),
        update,
        findMany,
      },
    } as unknown as PrismaService;
    const service = new GroupsService(prisma);

    await service.removeMember(groupId, organizationId, userId);

    expect(update).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId, userId } },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('throws when removing a member who is already removed or was never a member', async () => {
    const prisma = {
      groupMember: { findFirst: async () => null },
    } as unknown as PrismaService;
    const service = new GroupsService(prisma);

    await expect(service.removeMember(groupId, organizationId, userId)).rejects.toThrow(NotFoundException);
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

    await service.addManager(groupId, organizationId, { managerId: userId });

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
      managerGroup: {
        findFirst: async () => ({ groupId, managerId: userId }),
        update,
        findMany,
      },
    } as unknown as PrismaService;
    const service = new GroupsService(prisma);

    await service.removeManager(groupId, organizationId, userId);

    expect(update).toHaveBeenCalledWith({
      where: { groupId_managerId: { groupId, managerId: userId } },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
