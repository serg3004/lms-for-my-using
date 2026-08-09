import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

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
  updateAssessmentAnswerOptionSchema,
  updateAssessmentQuestionSchema,
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

  @Patch('questions/:id')
  @Roles(...rolePolicies.assessmentQuestionsCreate)
  @CourseScope('param', 'id', 'question')
  updateQuestion(@Param('id') questionId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateAssessmentQuestionSchema.parse(body);

    return this.assessmentQuestionsService.updateQuestion(questionId, request.currentUser!.organizationId, input);
  }

  @Delete('questions/:id')
  @Roles(...rolePolicies.assessmentQuestionsCreate)
  @CourseScope('param', 'id', 'question')
  deleteQuestion(@Param('id') questionId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentQuestionsService.deleteQuestion(questionId, request.currentUser!.organizationId);
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

  @Patch('questions/:questionId/options/:id')
  @Roles(...rolePolicies.assessmentAnswerOptionsCreate)
  @CourseScope('param', 'id', 'option')
  updateAnswerOption(@Param('id') optionId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateAssessmentAnswerOptionSchema.parse(body);

    return this.assessmentQuestionsService.updateAnswerOption(optionId, request.currentUser!.organizationId, input);
  }

  @Delete('questions/:questionId/options/:id')
  @Roles(...rolePolicies.assessmentAnswerOptionsCreate)
  @CourseScope('param', 'id', 'option')
  deleteAnswerOption(@Param('id') optionId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentQuestionsService.deleteAnswerOption(optionId, request.currentUser!.organizationId);
  }
}
