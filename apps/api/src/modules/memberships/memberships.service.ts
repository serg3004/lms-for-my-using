import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogService } from '../audit-log/public.js';
import { LEGACY_LIST_LIMIT } from '../../common/query-limits.js';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService = new AuditLogService(prisma),
  ) {}

  async listMemberships(organizationId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: LEGACY_LIST_LIMIT,
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

    const created = await this.prisma.membership.create({
      data: input,
      select: membershipSelect,
    });

    await this.auditLog.record({
      organizationId: input.organizationId,
      actorId: input.assignedBy ?? null,
      action: 'membership.assigned',
      targetType: 'user',
      targetId: input.userId,
      summary: `Assigned role ${input.role} to user`,
      metadata: { role: input.role },
    });

    return created;
  }

  /**
   * Takes one built-in role away from a user. The organization always keeps an administrator, and an
   * administrator cannot take their own administrator role away (that would lock them out of this screen).
   */
  async deleteMembership(membershipId: string, organizationId: string, actorId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId },
      select: membershipSelect,
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.role === 'admin') {
      if (membership.userId === actorId) {
        throw new ConflictException('Administrators cannot remove their own administrator role');
      }
      const administrators = await this.prisma.membership.count({ where: { organizationId, role: 'admin' } });
      if (administrators <= 1) {
        throw new ConflictException('The organization must keep at least one administrator');
      }
    }

    await this.prisma.membership.delete({ where: { id: membership.id } });

    await this.auditLog.record({
      organizationId,
      actorId,
      action: 'membership.revoked',
      targetType: 'user',
      targetId: membership.userId,
      summary: `Removed role ${membership.role} from user`,
      metadata: { role: membership.role },
    });
  }
}
