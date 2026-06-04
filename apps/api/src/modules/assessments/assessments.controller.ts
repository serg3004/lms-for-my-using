import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AssessmentsService } from './assessments.service.js';
import {
  createAssessmentSchema,
  CreateAssessmentInput,
  updateAssessmentStatusSchema,
  updateAssessmentSchema,
} from './assessments.schemas.js';

@Controller('assessments')
@UseGuards(AuthGuard, RolesGuard)
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Get()
  @Roles(...rolePolicies.assessmentsRead)
  listAssessments(@Req() request: AuthenticatedRequest) {
    return this.assessmentsService.listAssessments(request.currentUser!.organizationId);
  }

  @Get(':id')
  @Roles(...rolePolicies.assessmentsRead)
  getAssessment(@Param('id') assessmentId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentsService.getAssessment(assessmentId, request.currentUser!.organizationId);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.assessmentsCreate)
  @OrganizationScope('body', 'organizationId')
  createAssessment(@Body() body: unknown) {
    const input: CreateAssessmentInput = createAssessmentSchema.parse(body);

    return this.assessmentsService.createAssessment(input);
  }

  @Patch(':id/status')
  @Roles(...rolePolicies.assessmentsCreate)
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
  updateAssessment(@Param('id') assessmentId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateAssessmentSchema.parse(body);
    return this.assessmentsService.updateAssessment(assessmentId, request.currentUser!.organizationId, input);
  }
}
