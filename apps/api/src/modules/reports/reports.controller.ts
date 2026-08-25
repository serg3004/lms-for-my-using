import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, Roles, RolesGuard, rolePolicies } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
@UseGuards(AuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @Roles(...rolePolicies.reportsRead)
  getSummary(@Req() request: AuthenticatedRequest) {
    return this.reportsService.getSummary(request.currentUser!);
  }

  @Get('admin-dashboard')
  @Roles('admin')
  getAdminDashboard(@Req() request: AuthenticatedRequest) {
    return this.reportsService.getAdminDashboard(request.currentUser!);
  }
}
