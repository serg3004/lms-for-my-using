import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CourseAccessGuard, CourseScope } from '../course-access/course-access.guard.js';
import { isInstructorCourseScoped } from '../course-access/course-access.policy.js';
import { AssessmentsService } from './assessments.service.js';
import {
  createAssessmentSchema,
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
  createAssessment(@Body() body: unknown) {
    const input: CreateAssessmentInput = createAssessmentSchema.parse(body);

    return this.assessmentsService.createAssessment(input);
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
}
