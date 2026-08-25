import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, Roles, RolesGuard, rolePolicies } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { LearnerDashboardService } from './learner-dashboard.service.js';

@Controller('learner-dashboard')
@UseGuards(AuthGuard, RolesGuard)
export class LearnerDashboardController {
  constructor(private readonly learnerDashboardService: LearnerDashboardService) {}

  @Get()
  @Roles(...rolePolicies.learnerDashboardRead)
  getLearnerDashboard(@Req() request: AuthenticatedRequest) {
    return this.learnerDashboardService.getLearnerDashboard(request.currentUser!);
  }
}
