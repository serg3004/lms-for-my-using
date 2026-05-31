import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../../database/prisma.service.js';
import { AuthenticatedRequest } from './auth.guard.js';
import { CurrentUser } from './auth.schemas.js';
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
  ) {}

  async canActivate(context: ExecutionContext) {
    const allowedRoles = this.reflector.getAllAndOverride<UserRole[]>(rolesMetadataKey, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!allowedRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RoleLookupRequest>();
    const currentUser = request.currentUser;

    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    const membershipRoles = await this.getMembershipRoles(request, currentUser);
    const allowedRoleSet = new Set(allowedRoles);
    const hasAllowedRole = membershipRoles.some((role) => allowedRoleSet.has(role));

    if (!hasAllowedRole) {
      throw new ForbiddenException('Insufficient role');
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
