import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { LEGACY_LIST_LIMIT } from '../../common/query-limits.js';
import {
  AssignGroupManagerInput,
  AssignGroupMemberInput,
  CreateGroupInput,
  ListGroupsFilter,
  UpdateGroupInput,
} from './groups.schemas.js';

const groupSelect = {
  id: true,
  organizationId: true,
  name: true,
  slug: true,
  description: true,
  location: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { members: { where: { deletedAt: null } } } },
  managers: {
    where: { deletedAt: null },
    select: {
      manager: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} as const;

const userSummarySelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async listGroups(organizationId: string, filter: ListGroupsFilter = 'active') {
    const where =
      filter === 'deleted'
        ? { organizationId, deletedAt: { not: null } }
        : { organizationId, deletedAt: null, status: filter };

    return this.prisma.group.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: LEGACY_LIST_LIMIT,
      select: groupSelect,
    });
  }

  async getGroup(groupId: string, organizationId: string) {
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        organizationId,
        deletedAt: null,
      },
      select: groupSelect,
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return group;
  }

  async createGroup(input: CreateGroupInput) {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id: input.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const existingGroup = await this.prisma.group.findUnique({
      where: {
        organizationId_slug: {
          organizationId: input.organizationId,
          slug: input.slug,
        },
      },
      select: { id: true },
    });

    if (existingGroup) {
      throw new ConflictException('Group slug already exists in organization');
    }

    return this.prisma.group.create({
      data: input,
      select: groupSelect,
    });
  }

  async updateGroup(groupId: string, organizationId: string, input: UpdateGroupInput) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return this.prisma.group.update({
      where: { id: groupId, organizationId },
      data: input,
      select: groupSelect,
    });
  }

  async listMembers(groupId: string, organizationId: string) {
    await this.ensureGroupExists(groupId, organizationId);

    return this.fetchMembers(groupId, organizationId);
  }

  async addMember(groupId: string, organizationId: string, input: AssignGroupMemberInput) {
    await this.ensureGroupExists(groupId, organizationId);
    await this.ensureUserExists(input.userId, organizationId);

    await this.prisma.groupMember.upsert({
      where: { groupId_userId: { groupId, userId: input.userId } },
      create: { groupId, userId: input.userId, organizationId },
      update: { deletedAt: null },
    });

    return this.fetchMembers(groupId, organizationId);
  }

  async removeMember(groupId: string, organizationId: string, userId: string) {
    const member = await this.prisma.groupMember.findFirst({
      where: { groupId, userId, organizationId, deletedAt: null },
      select: { groupId: true, userId: true },
    });

    if (!member) {
      throw new NotFoundException('Group member not found');
    }

    await this.prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId } },
      data: { deletedAt: new Date() },
    });

    return this.fetchMembers(groupId, organizationId);
  }

  async listManagers(groupId: string, organizationId: string) {
    await this.ensureGroupExists(groupId, organizationId);

    return this.fetchManagers(groupId, organizationId);
  }

  async addManager(groupId: string, organizationId: string, input: AssignGroupManagerInput) {
    await this.ensureGroupExists(groupId, organizationId);
    await this.ensureUserExists(input.managerId, organizationId);

    await this.prisma.managerGroup.upsert({
      where: { groupId_managerId: { groupId, managerId: input.managerId } },
      create: { groupId, managerId: input.managerId, organizationId },
      update: { deletedAt: null },
    });

    return this.fetchManagers(groupId, organizationId);
  }

  async removeManager(groupId: string, organizationId: string, managerId: string) {
    const manager = await this.prisma.managerGroup.findFirst({
      where: { groupId, managerId, organizationId, deletedAt: null },
      select: { groupId: true, managerId: true },
    });

    if (!manager) {
      throw new NotFoundException('Group manager not found');
    }

    await this.prisma.managerGroup.update({
      where: { groupId_managerId: { groupId, managerId } },
      data: { deletedAt: new Date() },
    });

    return this.fetchManagers(groupId, organizationId);
  }

  private async fetchMembers(groupId: string, organizationId: string) {
    const members = await this.prisma.groupMember.findMany({
      where: { groupId, organizationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: LEGACY_LIST_LIMIT,
      select: { user: { select: userSummarySelect } },
    });

    return members.map((member) => member.user);
  }

  private async fetchManagers(groupId: string, organizationId: string) {
    const managers = await this.prisma.managerGroup.findMany({
      where: { groupId, organizationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: LEGACY_LIST_LIMIT,
      select: { manager: { select: userSummarySelect } },
    });

    return managers.map((entry) => entry.manager);
  }

  private async ensureGroupExists(groupId: string, organizationId: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }
  }

  private async ensureUserExists(userId: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
  }
}
