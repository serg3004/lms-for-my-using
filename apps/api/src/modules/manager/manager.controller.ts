import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
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
