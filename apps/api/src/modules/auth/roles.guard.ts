import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../../database/prisma.service.js';
import type { AuthenticatedRequest } from './auth.guard.js';
import { CurrentUser } from './auth.schemas.js';
import { markRequestScope } from './access-scope.js';
import { enforcedActionsForRoute, resolveCustomAccess } from './custom-role-access.js';
import { EffectivePermissionsLookup } from './effective-permissions.loader.js';
import { rolesMetadataKey, UserRole } from './roles.js';

const membershipRolesCacheKey: unique symbol = Symbol('membershipRoles');

type RoleLookupRequest = AuthenticatedRequest & {
  [membershipRolesCacheKey]?: readonly UserRole[];
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    @Optional() private readonly effectivePermissions?: EffectivePermissionsLookup,
  ) {}

  async canActivate(context: ExecutionContext) {
    const allowedRoles = this.reflector.getAllAndOverride<UserRole[]>(rolesMetadataKey, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!allowedRoles?.length) {
      throw new ForbiddenException('Missing role policy');
    }

    const request = context.switchToHttp().getRequest<RoleLookupRequest>();
    const currentUser = request.currentUser;

    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    const membershipRoles = await this.getMembershipRoles(request, currentUser);
    const allowedRoleSet = new Set(allowedRoles);
    const hasAllowedRole = membershipRoles.some((role) => allowedRoleSet.has(role));

    const actions = this.effectivePermissions
      ? enforcedActionsForRoute(context.getClass().name, context.getHandler().name)
      : [];
    if (actions.length === 0) {
      if (!hasAllowedRole) throw new ForbiddenException('Insufficient role');
      return true;
    }

    // PR 481/482: union with the active custom roles of the organization (empty while the organization switch is off).
    const permissions = await this.effectivePermissions!.forUser(currentUser);
    const access = resolveCustomAccess({ permissions, actions, userRoles: currentUser.roles, viaBuiltIn: hasAllowedRole });
    if (!hasAllowedRole && !access.opens) {
      throw new ForbiddenException('Insufficient role');
    }
    if (access.opens) {
      const widened = access.roles.length !== currentUser.roles.length || access.roles.some((role, index) => role !== currentUser.roles[index]);
      const user = widened ? { ...currentUser, roles: access.roles } : currentUser;
      if (widened) request.currentUser = user;
      if (access.orgWide || access.ownOnly) markRequestScope(user, { orgWide: access.orgWide, ownOnly: access.ownOnly });
    }

    return true;
  }

  private async getMembershipRoles(request: RoleLookupRequest, currentUser: CurrentUser) {
    if (request[membershipRolesCacheKey]) {
      return request[membershipRolesCacheKey];
    }

    const memberships = await this.prisma.membership.findMany({
      where: {
        organizationId: currentUser.organizationId,
        userId: currentUser.id,
      },
      select: { role: true },
    });
    const membershipRoles = memberships.map((membership) => membership.role);

    request[membershipRolesCacheKey] = membershipRoles;

    return membershipRoles;
  }
}
