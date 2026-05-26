import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AssessmentsService } from './assessments.service.js';
import { createAssessmentSchema, CreateAssessmentInput } from './assessments.schemas.js';

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
}
