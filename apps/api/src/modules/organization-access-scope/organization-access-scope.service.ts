import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { getSubtreeDepartmentIds } from '../departments/public.js';
import { ManagerTeamScope, isManagerTeamScoped } from '../manager-team-scope/public.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';
import { getTransitiveDirectReportIds } from '../reporting-lines/public.js';

type UserOwnedWhere = { user?: Prisma.UserWhereInput };

/**
 * Unifies the "effective manager team" scope from every relation that currently grants it:
 * ManagerGroup (existing, delegated to ManagerTeamScope), DepartmentManager DIRECT (PR 278),
 * and personal ReportingLine DIRECT, direct and transitive (PR 279).
 *
 * A DepartmentManager or ReportingLine row only ever contributes here when it is a current
 * (effectiveTo IS NULL), literal DIRECT-type row for the actor -- never FUNCTIONAL/PROJECT
 * (metadata-only per the plan) and, for DepartmentManager, never an inherited/effective manager
 * computed for some other department (that concept, from effective-managers.ts, answers "who
 * manages department X", not "what does this actor manage").
 *
 * This is a data-layer Prisma.WhereInput builder, not a Nest guard: it runs downstream of the
 * tenant-level OrganizationScopeGuard and role-level RolesGuard, and only narrows which rows
 * *within* the actor's own tenant a manager may see. Org-structure write operations stay
 * admin-only regardless of this scope (see rolePolicies.departmentManagersWrite etc.).
 */
@Injectable()
export class OrganizationAccessScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: ManagerTeamScope = new ManagerTeamScope(),
  ) {}

  /**
   * Departments the actor directly manages, plus every descendant. Effective users of that
   * scope are current (effectiveTo IS NULL) active *primary* memberships only -- an additional
   * (non-primary) membership never extends a manager's scope, per the plan.
   */
  async managedDepartmentIds(actor: TeamScopeActor): Promise<string[]> {
    if (!isManagerTeamScoped(actor)) return [];

    const directlyManaged = await this.prisma.departmentManager.findMany({
      where: { organizationId: actor.organizationId, userId: actor.id, type: 'DIRECT', effectiveTo: null },
      select: { departmentId: true },
    });
    if (directlyManaged.length === 0) return [];

    return getSubtreeDepartmentIds(
      this.prisma,
      directlyManaged.map((row) => row.departmentId),
      actor.organizationId,
    );
  }

  /** Every user id reporting to the actor via a current DIRECT ReportingLine, direct or transitive. */
  async directReportIds(actor: TeamScopeActor): Promise<string[]> {
    if (!isManagerTeamScoped(actor)) return [];
    return getTransitiveDirectReportIds(this.prisma, actor.id, actor.organizationId);
  }

  async user(actor: TeamScopeActor): Promise<Prisma.UserWhereInput> {
    if (!isManagerTeamScoped(actor)) return {};

    const groupWhere = this.teamScope.user(actor);
    const [departmentIds, reportIds] = await Promise.all([this.managedDepartmentIds(actor), this.directReportIds(actor)]);

    const extraBranches: Prisma.UserWhereInput[] = [];
    if (departmentIds.length > 0) {
      extraBranches.push({
        departmentMemberships: {
          some: {
            organizationId: actor.organizationId,
            departmentId: { in: departmentIds },
            isPrimary: true,
            effectiveTo: null,
          },
        },
      });
    }
    if (reportIds.length > 0) {
      extraBranches.push({ id: { in: reportIds } });
    }

    if (extraBranches.length === 0) return groupWhere;
    return { OR: [groupWhere, ...extraBranches] };
  }

  async assignment(actor: TeamScopeActor): Promise<Prisma.AssignmentWhereInput> {
    if (!isManagerTeamScoped(actor)) return {};
    return { OR: [{ user: await this.user(actor) }, { group: this.teamScope.group(actor) }] };
  }

  async userOwnedResource(actor: TeamScopeActor): Promise<UserOwnedWhere> {
    if (!isManagerTeamScoped(actor)) return {};
    return { user: await this.user(actor) };
  }
}
