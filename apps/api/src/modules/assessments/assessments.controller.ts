import { Body, Controller, ForbiddenException, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { OrganizationScope } from '../auth/public.js';
import { OrganizationScopeGuard } from '../auth/public.js';
import { Roles, rolePolicies } from '../auth/public.js';
import { RolesGuard } from '../auth/public.js';
import { CourseAccessGuard, CourseScope } from '../course-access/public.js';
import { isInstructorCourseScoped } from '../course-access/public.js';
import { AssessmentsService } from './assessments.service.js';
import {
  assessmentLibrarySchema,
  createAssessmentSchema,
  assessmentPlacementSchema,
  CreateAssessmentInput,
  updateAssessmentStatusSchema,
  updateAssessmentSchema,
} from './assessments.schemas.js';

@Controller('assessments')
@UseGuards(AuthGuard, RolesGuard, CourseAccessGuard)
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Get()
  @Roles(...rolePolicies.assessmentsRead)
  listAssessments(@Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    return this.assessmentsService.listAssessments(
      user.organizationId,
      isInstructorCourseScoped(user) ? user.id : undefined,
    );
  }

  @Get('library')
  @Roles(...rolePolicies.assessmentsCreate)
  listLibrary(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    return this.assessmentsService.listLibrary(user.organizationId, user.id, isInstructorCourseScoped(user), assessmentLibrarySchema.parse(query));
  }

  @Get(':id')
  @Roles(...rolePolicies.assessmentsRead)
  @CourseScope('param', 'id', 'assessment')
  getAssessment(@Param('id') assessmentId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentsService.getAssessment(assessmentId, request.currentUser!.organizationId);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.assessmentsCreate)
  @OrganizationScope('body', 'organizationId')
  @CourseScope('body', 'courseId')
  createAssessment(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input: CreateAssessmentInput = createAssessmentSchema.parse(body);

    if (!input.courseId && isInstructorCourseScoped(request.currentUser!)) throw new ForbiddenException();
    return this.assessmentsService.createAssessment(input, request.currentUser!.id);
  }

  @Post(':id/copy')
  @Roles(...rolePolicies.assessmentsCreate)
  @CourseScope('param', 'id', 'assessment')
  copyAssessment(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    return this.assessmentsService.copyAssessment(id, user.organizationId, user.id);
  }

  @Get(':id/placements')
  @Roles('admin')
  listPlacements(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentsService.listPlacements(id, request.currentUser!.organizationId);
  }

  @Post(':id/placements')
  @Roles('admin')
  attachPlacement(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.assessmentsService.attachPlacement(id, request.currentUser!.organizationId, assessmentPlacementSchema.parse(body));
  }

  @Delete(':id/placements/:placementId')
  @Roles('admin')
  detachPlacement(@Param('id') id: string, @Param('placementId') placementId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentsService.detachPlacement(id, placementId, request.currentUser!.organizationId);
  }

  @Patch(':id/status')
  @Roles(...rolePolicies.assessmentsCreate)
  @CourseScope('param', 'id', 'assessment')
  updateAssessmentStatus(
    @Param('id') assessmentId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = updateAssessmentStatusSchema.parse(body);
    return this.assessmentsService.updateAssessmentStatus(
      assessmentId,
      request.currentUser!.organizationId,
      input.status,
    );
  }

  @Patch(':id')
  @Roles(...rolePolicies.assessmentsCreate)
  @CourseScope('param', 'id', 'assessment')
  updateAssessment(@Param('id') assessmentId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateAssessmentSchema.parse(body);
    return this.assessmentsService.updateAssessment(assessmentId, request.currentUser!.organizationId, input);
  }

  @Delete(':id')
  @Roles(...rolePolicies.assessmentsCreate)
  @CourseScope('param', 'id', 'assessment')
  deleteAssessment(@Param('id') assessmentId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentsService.deleteAssessment(assessmentId, request.currentUser!.organizationId);
  }
}
