import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { computeEffectivePermissions, type EffectivePermissions } from './effective-permissions.js';
import type { CurrentUser } from './auth.schemas.js';
import type { UserRole } from './roles.js';

/**
 * PR 480/481: reads the built-in roles and the active custom roles of one user in one organization and computes the union.
 * Every query carries the organization; custom roles count only while the organization switch is on. Nothing is cached
 * across requests, so a revoked role stops working on the next request.
 */
export async function loadEffectivePermissions(prisma: PrismaService, organizationId: string, userId: string): Promise<EffectivePermissions> {
  const [organization, memberships, assignments] = await Promise.all([
    prisma.organization.findFirst({ where: { id: organizationId }, select: { customRolesEnabled: true } }),
    prisma.membership.findMany({ where: { organizationId, userId }, select: { role: true } }),
    prisma.userCustomRoleAssignment.findMany({
      where: { organizationId, userId, state: 'active', role: { organizationId, state: 'active' } },
      select: { role: { select: { state: true, permissions: { select: { action: true, scope: true } } } } },
    }),
  ]);
  return computeEffectivePermissions({
    builtInRoles: memberships.map((membership) => membership.role as UserRole),
    customRoles: assignments.map((assignment) => assignment.role),
    customRolesEnabled: organization?.customRolesEnabled ?? false,
  });
}

/** Per-request view of the effective rights: computed at most once for one authenticated user object. */
@Injectable()
export class EffectivePermissionsLookup {
  private readonly perRequest = new WeakMap<object, Promise<EffectivePermissions>>();

  constructor(private readonly prisma: PrismaService) {}

  forUser(user: Pick<CurrentUser, 'id' | 'organizationId'>): Promise<EffectivePermissions> {
    const cached = this.perRequest.get(user);
    if (cached) return cached;
    const loaded = loadEffectivePermissions(this.prisma, user.organizationId, user.id);
    this.perRequest.set(user, loaded);
    return loaded;
  }
}
