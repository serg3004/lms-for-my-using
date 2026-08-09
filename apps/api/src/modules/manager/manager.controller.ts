import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { Roles, rolePolicies } from '../auth/public.js';
import { RolesGuard } from '../auth/public.js';
import { ManagerService } from './manager.service.js';

@Controller('manager')
@UseGuards(AuthGuard, RolesGuard)
export class ManagerController {
  constructor(private readonly managerService: ManagerService) {}

  @Get('team-summary')
  @Roles(...rolePolicies.managerTeamSummaryRead)
  getTeamSummary(@Req() request: AuthenticatedRequest) {
    return this.managerService.getTeamSummary(request.currentUser!);
  }
}
