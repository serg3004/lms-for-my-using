import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../../database/prisma.service.js';
import { AuthenticatedRequest } from './auth.guard.js';
import { rolesMetadataKey, UserRole } from './roles.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,\n  ) {}

  async canActivate(context: ExecutionContext) {
    const allowedRoles = this.reflector.getAllAndOverride<UserRole[]>(rolesMetadataKey, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!allowedRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        organizationId: request.currentUser.organizationId,
        userId: request.currentUser.id,
        role: { in: allowedRoles },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
