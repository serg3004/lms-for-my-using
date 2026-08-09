import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { OrganizationScope } from '../auth/public.js';
import { OrganizationScopeGuard } from '../auth/public.js';
import { Roles, rolePolicies } from '../auth/public.js';
import { RolesGuard } from '../auth/public.js';
import { CourseAccessGuard, CourseScope } from '../course-access/public.js';
import {
  createAssessmentAnswerOptionSchema,
  createAssessmentQuestionSchema,
  CreateAssessmentAnswerOptionInput,
  CreateAssessmentQuestionInput,
} from './assessment-questions.schemas.js';
import { AssessmentQuestionsService } from './assessment-questions.service.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard, CourseAccessGuard)
export class AssessmentQuestionsController {
  constructor(private readonly assessmentQuestionsService: AssessmentQuestionsService) {}

  @Get('assessments/:assessmentId/questions')
  @Roles(...rolePolicies.assessmentQuestionsRead)
  @CourseScope('param', 'assessmentId', 'assessment')
  listQuestions(@Param('assessmentId') assessmentId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentQuestionsService.listQuestions(assessmentId, request.currentUser!.organizationId);
  }

  @Get('assessments/:assessmentId/quiz')
  @Roles(...rolePolicies.assessmentsRead)
  @CourseScope('param', 'assessmentId', 'assessment')
  listLearnerQuizQuestions(@Param('assessmentId') assessmentId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentQuestionsService.listLearnerQuizQuestions(assessmentId, request.currentUser!.organizationId);
  }

  @Get('questions/:id')
  @Roles(...rolePolicies.assessmentQuestionsRead)
  @CourseScope('param', 'id', 'question')
  getQuestion(@Param('id') questionId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentQuestionsService.getQuestion(questionId, request.currentUser!.organizationId);
  }

  @Post('assessments/:assessmentId/questions')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.assessmentQuestionsCreate)
  @OrganizationScope('body', 'organizationId')
  @CourseScope('param', 'assessmentId', 'assessment')
  createQuestion(@Param('assessmentId') assessmentId: string, @Body() body: unknown) {
    const input: CreateAssessmentQuestionInput = createAssessmentQuestionSchema.parse(body);

    return this.assessmentQuestionsService.createQuestion(assessmentId, input);
  }

  @Get('questions/:questionId/options')
  @Roles(...rolePolicies.assessmentAnswerOptionsRead)
  @CourseScope('param', 'questionId', 'question')
  listAnswerOptions(@Param('questionId') questionId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentQuestionsService.listAnswerOptions(questionId, request.currentUser!.organizationId);
  }

  @Post('questions/:questionId/options')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.assessmentAnswerOptionsCreate)
  @OrganizationScope('body', 'organizationId')
  @CourseScope('param', 'questionId', 'question')
  createAnswerOption(@Param('questionId') questionId: string, @Body() body: unknown) {
    const input: CreateAssessmentAnswerOptionInput = createAssessmentAnswerOptionSchema.parse(body);

    return this.assessmentQuestionsService.createAnswerOption(questionId, input);
  }
}
