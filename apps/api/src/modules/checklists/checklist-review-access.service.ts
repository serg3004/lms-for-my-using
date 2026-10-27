import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { rolePolicies, type CurrentUser } from '../auth/public.js';
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
   * Read/scheduling object scope for the ChecklistSession model introduced by PR 288.
   * Keeping this policy in the existing review-access service lets session rows and every
   * nested read apply the same parent scope instead of authorizing child UUIDs directly.
   * Observer mutations use observerActionScope() rather than this read-oriented union.
   */
  async sessionScope(user: CurrentUser): Promise<ChecklistSessionAccessScope> {
    if (user.roles.includes('admin')) return {};
    if (isManagerTeamScoped(user)) {
      const managerScope = { instance: { user: await this.organizationScope.user(user) } };
      return { OR: [managerScope, { observerId: user.id }] };
    }
    if (user.roles.includes('instructor') || user.roles.includes('mentor')) return { observerId: user.id };
    return { OR: [{ instance: { userId: user.id } }, { observerId: user.id }] };
  }

  /** Scheduling/export retain the manager's team scope, independently of observer reads. */
  async sessionManagementScope(user: CurrentUser): Promise<ChecklistSessionAccessScope> {
    if (user.roles.includes('admin')) return {};
    return { instance: { user: await this.organizationScope.user(user) } };
  }

  /** Conduct is always assignment-scoped, including administrators and combined roles. */
  observerActionScope(user: CurrentUser): ChecklistSessionAccessScope {
    return { observerId: user.id };
  }

  async isAssignedObserver(user: CurrentUser, instanceId: string): Promise<boolean> {
    return Boolean(await this.prisma.checklistSession.findFirst({
      where: { organizationId: user.organizationId, instanceId, observerId: user.id, deletedAt: null },
      select: { id: true },
    }));
  }

  /** Creation is narrower than read access: only schedulers may select another observer. */
  assertSessionCreationObserver(user: CurrentUser, observerId: string): void {
    if (!rolePolicies.checklistSessionsManage.some((role) => user.roles.includes(role)) && observerId !== user.id) {
      throw new NotFoundException('Observer not found');
    }
  }

  /**
   * Admin API participant lookup (PR 292): who a manager may pick as a session's learner when
   * scheduling. Tenant-wide for admin, effective team scope (same union as everywhere else) for
   * manager -- reuses `OrganizationAccessScopeService.user()` directly (a plain `User` filter,
   * not nested under an `instance`/`user` relation) since the lookup queries `User` rows, not
   * `ChecklistInstance` rows. Instructors without manager/admin permissions may pick active
   * learners in their tenant; creation separately pins observerId to the caller.
   */
  async participantLearnerScope(user: CurrentUser): Promise<Prisma.UserWhereInput> {
    return isManagerTeamScoped(user) ? this.organizationScope.user(user) : {};
  }
}
