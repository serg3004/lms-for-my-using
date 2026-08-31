import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, Roles, RolesGuard, rolePolicies } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { reportsSummaryQuerySchema } from './reports.schemas.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
@UseGuards(AuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @Roles(...rolePolicies.reportsRead)
  getSummary(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const { departmentId, includeDescendants } = reportsSummaryQuerySchema.parse(query);
    return this.reportsService.getSummary(
      request.currentUser!,
      departmentId ? { departmentId, includeDescendants } : undefined,
    );
  }

  @Get('admin-dashboard')
  @Roles('admin')
  getAdminDashboard(@Req() request: AuthenticatedRequest) {
    return this.reportsService.getAdminDashboard(request.currentUser!);
  }
}
