import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedAccess } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { CustomRolesService } from './custom-roles.service.js';

/** The signed-in user's own effective rights, for display only: every decision is made again on the server. */
@Controller('me')
@UseGuards(AuthGuard)
export class MePermissionsController {
  constructor(private readonly roles: CustomRolesService) {}

  @Get('permissions')
  @AuthenticatedAccess()
  permissions(@Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    return this.roles.describeEffective(user.organizationId, user.id);
  }
}
