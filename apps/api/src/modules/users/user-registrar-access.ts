import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service.js';
import { customUserScope } from '../auth/public.js';
import { OrganizationAccessScopeService } from '../organization-access-scope/public.js';
import { getSubtreeDepartmentIds } from '../departments/public.js';
import type { TeamScopeActor } from '../manager-team-scope/public.js';

/**
 * PR 483: a delegated registrar is a user who reaches the user routes only through a custom role (`user.create`,
 * `user.import`, `user.update`, `user.deactivate`, `user.read` with the scope `department` or `organization`).
 * Built-in administrators and managers never become registrars: `RolesGuard` marks the request only when no built-in role
 * opened the route, so their behaviour stays exactly as it was.
 */
export type Registrar = {
  scope: 'department' | 'organization';
  /** The department of the registrar with every descendant; null for the organization scope. */
  departmentIds: string[] | null;
};

export class UserRegistrarAccess {
  constructor(private readonly prisma: PrismaService) {}

  /** null: not a delegated registrar, the built-in rules apply. */
  async resolve(actor: TeamScopeActor | undefined): Promise<Registrar | null> {
    const scope = actor ? customUserScope(actor) : undefined;
    if (!actor || !scope) return null;
    if (scope === 'organization') return { scope, departmentIds: null };

    const own = await this.prisma.departmentMembership.findMany({
      where: { organizationId: actor.organizationId, userId: actor.id, isPrimary: true, effectiveTo: null },
      select: { departmentId: true },
    });
    const departmentIds = own.length === 0 ? [] : await getSubtreeDepartmentIds(this.prisma, own.map((row) => row.departmentId), actor.organizationId);
    return { scope, departmentIds };
  }

  async resolveCreation(actor: TeamScopeActor | undefined): Promise<Registrar | null> {
    if (actor?.roles.includes('admin')) return null;
    const delegated = await this.resolve(actor);
    if (delegated || !actor?.roles.includes('manager')) return delegated;
    return { scope: 'department', departmentIds: await new OrganizationAccessScopeService(this.prisma).managedDepartmentIds(actor) };
  }

  /** Users the registrar may see: the own department tree, or everybody for the organization scope. */
  readWhere(registrar: Registrar | null, organizationId: string): Prisma.UserWhereInput {
    if (!registrar || registrar.departmentIds === null) return {};
    return { departmentMemberships: { some: this.membershipIn(registrar.departmentIds, organizationId) } };
  }

  /**
   * Users the registrar may change or suspend: the same people as for reading, but never the registrar, and only people who
   * hold no role above the learner (an administrator, a manager or an instructor stays with the administrator).
   */
  writeWhere(registrar: Registrar | null, actor: TeamScopeActor): Prisma.UserWhereInput {
    if (!registrar) return {};
    return {
      AND: [
        this.readWhere(registrar, actor.organizationId),
        { id: { not: actor.id } },
        { memberships: { none: { organizationId: actor.organizationId, role: { not: 'learner' } } } },
      ],
    };
  }

  /** The department a new user is placed in: inside the registrar's tree, required for the department scope. */
  async assertDepartment(registrar: Registrar, organizationId: string, departmentId: string | undefined): Promise<string | null> {
    if (registrar.departmentIds !== null) {
      if (!departmentId || !registrar.departmentIds.includes(departmentId)) {
        throw new ForbiddenException('The department is outside your area');
      }
    }
    if (!departmentId) return null;
    const exists = await this.prisma.department.findFirst({ where: { id: departmentId, organizationId, status: 'active' }, select: { id: true } });
    if (!exists) throw new NotFoundException('Department not found');
    return departmentId;
  }

  membershipIn(departmentIds: string[], organizationId: string): Prisma.DepartmentMembershipWhereInput {
    return { organizationId, departmentId: { in: departmentIds }, isPrimary: true, effectiveTo: null };
  }
}

export function assertNoRoleChange(registrar: Registrar | null, role: unknown): void {
  if (registrar && role !== undefined) {
    throw new ForbiddenException('Roles are granted by an administrator');
  }
}
