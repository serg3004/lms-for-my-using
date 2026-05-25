import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthenticatedRequest } from './auth.guard.js';
import {
  organizationScopeMetadataKey,
  OrganizationScopeSource,
} from './organization-scope.js';

function getScopedOrganizationId(request: AuthenticatedRequest, source: OrganizationScopeSource) {
  if (source.location === 'param') {
    return request.params?.[source.name];
  }

  const value = request.body?.[source.name];

  return typeof value === 'string' ? value : undefined;
}

@Injectable()
export class OrganizationScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const source = this.reflector.getAllAndOverride<OrganizationScopeSource>(organizationScopeMetadataKey, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!source) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    const scopedOrganizationId = getScopedOrganizationId(request, source);

    if (!scopedOrganizationId || scopedOrganizationId !== request.currentUser.organizationId) {
      throw new ForbiddenException('Organization scope mismatch');
    }

    return true;
  }
}
