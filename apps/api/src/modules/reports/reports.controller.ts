import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, Roles, RolesGuard, rolePolicies } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { CourseAnalyticsService } from './course-analytics.service.js';
import { courseAnalyticsExportQuerySchema, courseAnalyticsQuerySchema, reportsSummaryQuerySchema } from './reports.schemas.js';
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
    const { departmentId, includeDescendants, fieldFilters, groupByField } = reportsSummaryQuerySchema.parse(query);
    return this.reportsService.getSummary(
      request.currentUser!,
      departmentId ? { departmentId, includeDescendants } : undefined,
      ...(fieldFilters || groupByField ? [{ fieldFilters, groupByField }] as const : []),
    );
  }

  @Get('admin-dashboard')
  @Roles(...rolePolicies.adminDashboardRead)
  getAdminDashboard(@Req() request: AuthenticatedRequest) {
    return this.reportsService.getAdminDashboard(request.currentUser!);
  }

  @Get('course-analytics')
  @Roles(...rolePolicies.courseAnalyticsRead)
  getCourseAnalytics(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.courseAnalytics.getCourses(request.currentUser!, courseAnalyticsQuerySchema.parse(query));
  }

  /** PR 475: the current view as CSV/XLSX rows, with the same scope and filters as the reads. */
  @Get('course-analytics/export')
  @Roles(...rolePolicies.courseAnalyticsRead)
  exportCourseAnalytics(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.courseAnalytics.export(request.currentUser!, courseAnalyticsExportQuerySchema.parse(query));
  }

  @Get('course-analytics/courses/:courseId')
  @Roles(...rolePolicies.courseAnalyticsRead)
  getCourseReport(@Param('courseId', ParseUUIDPipe) courseId: string, @Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.courseAnalytics.getCourseReport(request.currentUser!, courseId, courseAnalyticsQuerySchema.parse(query));
  }

  @Get('course-analytics/users/:userId')
  @Roles(...rolePolicies.courseAnalyticsRead)
  getUserReport(@Param('userId', ParseUUIDPipe) userId: string, @Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.courseAnalytics.getUserReport(request.currentUser!, userId, courseAnalyticsQuerySchema.parse(query));
  }
}
