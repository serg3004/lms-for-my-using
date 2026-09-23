import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import type { CurrentUser } from '../auth/public.js';
import { isManagerTeamScoped } from '../manager-team-scope/public.js';
import { OrganizationAccessScopeService } from '../organization-access-scope/public.js';

export type ChecklistSessionAccessScope = {
  observerId?: string;
  instance?: { userId?: string; user?: Prisma.UserWhereInput };
  OR?: ChecklistSessionAccessScope[];
};

@Injectable()
export class ChecklistReviewAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationScope: OrganizationAccessScopeService,
  ) {}

  async filterPending<T extends { userId: string }>(user: CurrentUser, instances: T[]): Promise<T[]> {
    if (!isManagerTeamScoped(user) || instances.length === 0) return instances;

    const allowedUsers = await this.prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        id: { in: instances.map((instance) => instance.userId) },
        deletedAt: null,
        ...(await this.organizationScope.user(user)),
      },
      select: { id: true },
    });
    const allowedIds = new Set(allowedUsers.map((candidate) => candidate.id));
    return instances.filter((instance) => allowedIds.has(instance.userId));
  }

  async assertReviewerCanAccess(user: CurrentUser, instanceId: string) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: {
        id: instanceId,
        organizationId: user.organizationId,
        deletedAt: null,
        ...(isManagerTeamScoped(user) ? await this.organizationScope.userOwnedResource(user) : {}),
      },
      select: { id: true, reviewerId: true },
    });

    if (!instance) throw new NotFoundException('Checklist assignment not found');
    if (instance.reviewerId && instance.reviewerId !== user.id && !user.roles.includes('admin')) {
      throw new NotFoundException('Checklist assignment not found');
    }
  }

  async reviewQueueScope(user: CurrentUser) {
    return isManagerTeamScoped(user) ? this.organizationScope.userOwnedResource(user) : {};
  }

  /**
   * Canonical object scope for the ChecklistSession model introduced by PR 288.
   * Keeping this policy in the existing review-access service lets session rows and every
   * nested resource apply the same parent scope instead of authorizing child UUIDs directly.
   */
  async sessionScope(user: CurrentUser): Promise<ChecklistSessionAccessScope> {
    if (user.roles.includes('admin')) return {};
    if (isManagerTeamScoped(user)) {
      const managerScope = { instance: { user: await this.organizationScope.user(user) } };
      return user.roles.includes('instructor')
        ? { OR: [managerScope, { observerId: user.id }] }
        : managerScope;
    }
    if (user.roles.includes('instructor')) return { observerId: user.id };
    return { instance: { userId: user.id } };
  }

  /**
   * Admin API participant lookup (PR 292): who a manager may pick as a session's learner when
   * scheduling. Tenant-wide for admin, effective team scope (same union as everywhere else) for
   * manager -- reuses `OrganizationAccessScopeService.user()` directly (a plain `User` filter,
   * not nested under an `instance`/`user` relation) since the lookup queries `User` rows, not
   * `ChecklistInstance` rows.
   */
  async participantLearnerScope(user: CurrentUser): Promise<Prisma.UserWhereInput> {
    return isManagerTeamScoped(user) ? this.organizationScope.user(user) : {};
  }
}
