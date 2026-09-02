import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { getSubtreeDepartmentIds } from '../departments/public.js';
import { ManagerTeamScope, isManagerTeamScoped } from '../manager-team-scope/public.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';

type UserOwnedWhere = { user?: Prisma.UserWhereInput };

/**
 * Unifies the "effective manager team" scope from every relation that currently grants it:
 * ManagerGroup (existing, delegated to ManagerTeamScope) and DepartmentManager DIRECT (PR 278).
 * ReportingLine DIRECT (PR 279) is a planned third union branch, not yet built.
 *
 * A DepartmentManager row only ever contributes here when it is a current (effectiveTo IS NULL),
 * literal DIRECT-type row for the actor -- never FUNCTIONAL (metadata-only per the plan) and
 * never an inherited/effective manager computed for some other department (that concept, from
 * effective-managers.ts, answers "who manages department X", not "what does this actor manage").
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

  async user(actor: TeamScopeActor): Promise<Prisma.UserWhereInput> {
    if (!isManagerTeamScoped(actor)) return {};

    const groupWhere = this.teamScope.user(actor);
    const departmentIds = await this.managedDepartmentIds(actor);
    if (departmentIds.length === 0) return groupWhere;

    return {
      OR: [
        groupWhere,
        {
          departmentMemberships: {
            some: {
              organizationId: actor.organizationId,
              departmentId: { in: departmentIds },
              isPrimary: true,
              effectiveTo: null,
            },
          },
        },
      ],
    };
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
