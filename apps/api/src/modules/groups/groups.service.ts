import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { CreateGroupInput } from './groups.schemas.js';

const groupSelect = {
  id: true,
  organizationId: true,
  name: true,
  slug: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async listGroups(organizationId: string) {
    return this.prisma.group.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
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
}
