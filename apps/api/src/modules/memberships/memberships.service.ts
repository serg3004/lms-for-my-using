import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { CreateMembershipInput } from './memberships.schemas.js';

const membershipSelect = {
  id: true,
  organizationId: true,
  userId: true,
  role: true,
  assignedBy: true,
  createdAt: true,
} as const;

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMemberships(organizationId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: membershipSelect,
    });
  }

  async getMembership(membershipId: string, organizationId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: membershipId,
        organizationId,
      },
      select: membershipSelect,
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    return membership;
  }

  async createMembership(input: CreateMembershipInput) {
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

    const user = await this.prisma.user.findFirst({
      where: {
        id: input.userId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found in organization');
    }

    if (input.assignedBy) {
      const assignedByUser = await this.prisma.user.findFirst({
        where: {
          id: input.assignedBy,
          organizationId: input.organizationId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!assignedByUser) {
        throw new NotFoundException('Assigned by user not found in organization');
      }
    }

    const existingMembership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId_role: {
          organizationId: input.organizationId,
          userId: input.userId,
          role: input.role,
        },
      },
      select: { id: true },
    });

    if (existingMembership) {
      throw new ConflictException('Membership role already assigned to user');
    }

    return this.prisma.membership.create({
      data: input,
      select: membershipSelect,
    });
  }
}
