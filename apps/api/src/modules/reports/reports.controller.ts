import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, Roles, RolesGuard, rolePolicies } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { CourseAnalyticsService } from './course-analytics.service.js';
import { courseAnalyticsQuerySchema, reportsSummaryQuerySchema } from './reports.schemas.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
@UseGuards(AuthGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly courseAnalytics: CourseAnalyticsService,
  ) {}

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

  @Get('course-analytics')
  @Roles('admin', 'manager', 'instructor')
  getCourseAnalytics(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.courseAnalytics.getCourses(request.currentUser!, courseAnalyticsQuerySchema.parse(query));
  }

  @Get('course-analytics/courses/:courseId')
  @Roles('admin', 'manager', 'instructor')
  getCourseReport(@Param('courseId', ParseUUIDPipe) courseId: string, @Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.courseAnalytics.getCourseReport(request.currentUser!, courseId, courseAnalyticsQuerySchema.parse(query));
  }

  @Get('course-analytics/users/:userId')
  @Roles('admin', 'manager', 'instructor')
  getUserReport(@Param('userId', ParseUUIDPipe) userId: string, @Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.courseAnalytics.getUserReport(request.currentUser!, userId, courseAnalyticsQuerySchema.parse(query));
  }
}
