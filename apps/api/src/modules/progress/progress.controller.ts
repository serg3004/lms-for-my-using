import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';

import { paginationQuerySchema } from '../../common/pagination.schema.js';
import { AuthGuard } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { OrganizationScope } from '../auth/public.js';
import { OrganizationScopeGuard } from '../auth/public.js';
import { Roles, isLearnerOnly, rolePolicies } from '../auth/public.js';
import { RolesGuard } from '../auth/public.js';
import { CourseAccessGuard, CourseScope } from '../course-access/public.js';
import { isInstructorCourseScoped } from '../course-access/public.js';
import { createProgressSchema, CreateProgressInput, progressSummaryQuerySchema } from './progress.schemas.js';
import { ProgressService } from './progress.service.js';

@Controller('progress')
@UseGuards(AuthGuard, RolesGuard, CourseAccessGuard)
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('summary')
  @Roles(...rolePolicies.progressRead)
  getProgressSummary(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    const currentUser = request.currentUser!;
    const { period } = progressSummaryQuerySchema.parse(query);
    return this.progressService.getProgressSummary(currentUser, period);
  }

  @Get()
  @Roles(...rolePolicies.progressRead)
  listProgress(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    const currentUser = request.currentUser!;
    const userId = isLearnerOnly(currentUser.roles) ? currentUser.id : undefined;
    const { page, pageSize } = paginationQuerySchema.parse(query);
    if (isInstructorCourseScoped(currentUser)) {
      return this.progressService.listProgress(currentUser, userId, page, pageSize, currentUser.id);
    }
    return this.progressService.listProgress(currentUser, userId, page, pageSize);
  }

  @Get(':id')
  @Roles(...rolePolicies.progressRead)
  @CourseScope('param', 'id', 'progress')
  getProgress(@Param('id') progressId: string, @Req() request: AuthenticatedRequest) {
    const currentUser = request.currentUser!;
    const userId = isLearnerOnly(currentUser.roles) ? currentUser.id : undefined;
    return this.progressService.getProgress(progressId, currentUser, userId);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.progressCreate)
  @OrganizationScope('body', 'organizationId')
  @CourseScope('body', 'courseId')
  createProgress(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const currentUser = request.currentUser!;
    const input: CreateProgressInput = createProgressSchema.parse(body);
    const safeInput = isLearnerOnly(currentUser.roles) ? { ...input, userId: currentUser.id } : input;

    return this.progressService.createProgress(safeInput, currentUser);
  }
}
