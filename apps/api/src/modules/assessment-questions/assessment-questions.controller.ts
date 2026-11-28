import { z } from 'zod';
import { QuestionBankService } from './question-bank.service.js';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

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
import { assessmentLinkToken, StandaloneAssessmentsService } from '../assessments/public.js';
import { AssessmentQuestionsService } from './assessment-questions.service.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard, CourseAccessGuard)
export class AssessmentQuestionsController {
  constructor(private readonly assessmentQuestionsService: AssessmentQuestionsService, private readonly standalone: StandaloneAssessmentsService, private readonly bank: QuestionBankService) {}

  @Get('question-bank')
  @Roles(...rolePolicies.assessmentQuestionsCreate)
  listBankQuestions(@Req() request: AuthenticatedRequest, @Query('search') search?: string, @Query('folderId') folderId?: string, @Query('page') page?: string) {
    return this.bank.list(request.currentUser!.organizationId, z.string().max(200).parse(search ?? ''), z.guid().optional().parse(folderId),
      z.coerce.number().int().min(1).max(100_000).default(1).parse(page));
  }

  @Post('question-bank/folders')
  @Roles(...rolePolicies.assessmentQuestionsCreate)
  createBankFolder(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const { name } = z.object({ name: z.string().trim().min(1).max(200) }).parse(body);
    return this.bank.createFolder(request.currentUser!.organizationId, name);
  }

  @Post('question-bank')
  @Roles(...rolePolicies.assessmentQuestionsCreate)
  createBankQuestion(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const { folderId, content } = z.object({ folderId: z.guid(), content: z.unknown() }).parse(body);
    return this.bank.create(request.currentUser!.organizationId, folderId, content);
  }

  @Post('question-bank/import')
  @Roles(...rolePolicies.assessmentQuestionsCreate)
  importBankQuestions(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const { folderId, rows } = z.object({
      folderId: z.guid(),
      rows: z.array(z.object({ row: z.number().int().min(2), content: z.unknown() })).max(100),
    }).parse(body);
    return this.bank.import(request.currentUser!.organizationId, folderId, rows);
  }

  @Get('question-bank/:id')
  @Roles(...rolePolicies.assessmentQuestionsCreate)
  getBankQuestion(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.bank.get(request.currentUser!.organizationId, z.guid().parse(id));
  }

  @Get('question-bank/:id/usage')
  @Roles(...rolePolicies.assessmentQuestionsCreate)
  bankQuestionUsage(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.bank.usage(request.currentUser!.organizationId, z.guid().parse(id));
  }

  @Patch('question-bank/:id')
  @Roles(...rolePolicies.assessmentQuestionsCreate)
  updateBankQuestion(@Param('id') id: string, @Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const { content, confirmation } = z.object({ content: z.unknown(), confirmation: z.string().length(64) }).parse(body);
    return this.bank.update(request.currentUser!.organizationId, z.guid().parse(id), content, confirmation, request.currentUser!.id);
  }

  @Post('assessments/:assessmentId/question-bank/:id')
  @Roles(...rolePolicies.assessmentQuestionsCreate)
  @CourseScope('param', 'assessmentId', 'assessment')
  linkBankQuestion(@Param('assessmentId') assessmentId: string, @Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.bank.link(request.currentUser!.organizationId, z.guid().parse(assessmentId), z.guid().parse(id));
  }

  @Post('assessments/:assessmentId/question-bank-sample')
  @Roles(...rolePolicies.assessmentQuestionsCreate)
  @CourseScope('param', 'assessmentId', 'assessment')
  sampleBankQuestions(@Param('assessmentId') assessmentId: string, @Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const { folderId, size } = z.object({ folderId: z.guid(), size: z.number().int().min(1).max(100) }).parse(body);
    return this.bank.configureSample(request.currentUser!.organizationId, z.guid().parse(assessmentId), folderId, size);
  }

  @Post('questions/:id/detach-bank')
  @Roles(...rolePolicies.assessmentQuestionsCreate)
  @CourseScope('param', 'id', 'question')
  detachBankQuestion(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.bank.detach(request.currentUser!.organizationId, z.guid().parse(id));
  }

  @Get('assessments/:assessmentId/questions')
  @Roles(...rolePolicies.assessmentQuestionsRead)
  @CourseScope('param', 'assessmentId', 'assessment')
  listQuestions(@Param('assessmentId') assessmentId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentQuestionsService.listQuestions(assessmentId, request.currentUser!.organizationId);
  }

  @Get('assessments/:assessmentId/quiz')
  @Roles(...rolePolicies.assessmentsRead)
  @CourseScope('param', 'assessmentId', 'assessment')
  async listLearnerQuizQuestions(@Param('assessmentId') assessmentId: string, @Req() request: AuthenticatedRequest, @Query('token') token?: string) {
    const actor = request.currentUser!;
    await this.standalone.assertAccess(assessmentId, actor.organizationId, actor.id, assessmentLinkToken.optional().parse(token));
    return this.assessmentQuestionsService.listLearnerQuizQuestions(assessmentId, request.currentUser!.organizationId, request.currentUser!.id);
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
