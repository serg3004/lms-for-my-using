import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import {
  createAssessmentAnswerOptionSchema,
  createAssessmentQuestionSchema,
  CreateAssessmentAnswerOptionInput,
  CreateAssessmentQuestionInput,
} from './assessment-questions.schemas.js';
import { AssessmentQuestionsService } from './assessment-questions.service.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class AssessmentQuestionsController {
  constructor(private readonly assessmentQuestionsService: AssessmentQuestionsService) {}

  @Get('assessments/:assessmentId/questions')
  @Roles(...rolePolicies.assessmentQuestionsRead)
  listQuestions(@Param('assessmentId') assessmentId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentQuestionsService.listQuestions(assessmentId, request.currentUser!.organizationId);
  }

  @Get('questions/:id')
  @Roles(...rolePolicies.assessmentQuestionsRead)
  getQuestion(@Param('id') questionId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentQuestionsService.getQuestion(questionId, request.currentUser!.organizationId);
  }

  @Post('assessments/:assessmentId/questions')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.assessmentQuestionsCreate)
  @OrganizationScope('body', 'organizationId')
  createQuestion(@Param('assessmentId') assessmentId: string, @Body() body: unknown) {
    const input: CreateAssessmentQuestionInput = createAssessmentQuestionSchema.parse(body);

    return this.assessmentQuestionsService.createQuestion(assessmentId, input);
  }

  @Get('questions/:questionId/options')
  @Roles(...rolePolicies.assessmentAnswerOptionsRead)
  listAnswerOptions(@Param('questionId') questionId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentQuestionsService.listAnswerOptions(questionId, request.currentUser!.organizationId);
  }

  @Post('questions/:questionId/options')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.assessmentAnswerOptionsCreate)
  @OrganizationScope('body', 'organizationId')
  createAnswerOption(@Param('questionId') questionId: string, @Body() body: unknown) {
    const input: CreateAssessmentAnswerOptionInput = createAssessmentAnswerOptionSchema.parse(body);

    return this.assessmentQuestionsService.createAnswerOption(questionId, input);
  }
}
