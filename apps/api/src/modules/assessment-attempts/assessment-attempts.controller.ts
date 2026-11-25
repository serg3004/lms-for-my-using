import { z } from 'zod';
import { Body, Controller, ForbiddenException, Get, Header, HttpCode, Param, Post, Put, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { Roles, rolePolicies } from '../auth/public.js';
import { RolesGuard } from '../auth/public.js';
import { isInstructorCourseScoped, CourseAccessGuard, CourseScope } from '../course-access/public.js';
import { assessmentLinkToken, StandaloneAssessmentsService } from '../assessments/public.js';
import { AssessmentAttemptsService } from './assessment-attempts.service.js';
import {
  createAssessmentAttemptSchema,
  recordAssessmentAnswerSchema,
  CreateAssessmentAttemptInput,
} from './assessment-attempts.schemas.js';
import { assessmentExportInput, AssessmentExportsService } from './assessment-exports.service.js';
import { exportMime, type ExportFormat } from './assessment-export-file.js';
import { assessmentAnalyticsQuery } from './assessment-analytics.js';
import { AssessmentResultsService } from './assessment-results.service.js';

import { AssessmentManualReviewService, reviewQueueQuery, reviewAnswerInput } from './assessment-manual-review.service.js';

const exportId = z.string().regex(/^[a-f0-9]{64}$/);

function exportFile({ file, format }: { file: Buffer; format: ExportFormat }) {
  return new StreamableFile(file, { type: exportMime[format], disposition: `attachment; filename="assessment.${format}"` });
}

const placementQuery = z.union([z.guid(), z.literal('standalone').transform(() => null)]).optional();

@Controller()
@UseGuards(AuthGuard, RolesGuard, CourseAccessGuard)
export class AssessmentAttemptsController {
  constructor(
    private readonly assessmentAttemptsService: AssessmentAttemptsService,
    private readonly assessmentResultsService: AssessmentResultsService,
    private readonly standalone: StandaloneAssessmentsService,
    private readonly manualReview: AssessmentManualReviewService,
    private readonly exports: AssessmentExportsService,
  ) {}

  @Get('assessment-reviews')
  @Roles(...rolePolicies.assessmentAnswerReview)
  reviewQueue(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.manualReview.queue(request.currentUser!, reviewQueueQuery.parse(query));
  }

  @Post('assessment-reviews/:id')
  @Roles(...rolePolicies.assessmentAnswerReview)
  reviewAnswer(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.manualReview.review(request.currentUser!, z.guid().parse(id), reviewAnswerInput.parse(body));
  }

  @Get('assessments/:assessmentId/attempts')
  @Roles(...rolePolicies.assessmentAttemptsRead)
  @CourseScope('param', 'assessmentId', 'assessment')
  listAttempts(@Param('assessmentId') assessmentId: string, @Req() request: AuthenticatedRequest, @Query('placementId') placementId?: string) {
    return this.assessmentAttemptsService.listAttempts(assessmentId, request.currentUser!, placementQuery.parse(placementId));
  }

  @Get('assessments/:assessmentId/results')
  @Roles(...rolePolicies.assessmentAttemptsRead)
  @CourseScope('param', 'assessmentId', 'assessment')
  listAssessmentResults(@Param('assessmentId') assessmentId: string, @Req() request: AuthenticatedRequest, @Query('placementId') placementId?: string) {
    return this.assessmentResultsService.listAssessmentResults(assessmentId, request.currentUser!, placementQuery.parse(placementId));
  }

  @Get('assessment-analytics/layout')
  @Roles(...rolePolicies.assessmentAttemptsRead)
  getAnalyticsLayout(@Req() request: AuthenticatedRequest) {
    return this.assessmentResultsService.getAnalyticsLayout(request.currentUser!);
  }

  @Put('assessment-analytics/layout')
  @Roles(...rolePolicies.assessmentAttemptsRead)
  saveAnalyticsLayout(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.assessmentResultsService.saveAnalyticsLayout(request.currentUser!, body);
  }

  @Get('assessments/:assessmentId/analytics')
  @Roles(...rolePolicies.assessmentAttemptsRead)
  @CourseScope('param', 'assessmentId', 'assessment')
  getAssessmentAnalytics(@Param('assessmentId') assessmentId: string, @Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.assessmentResultsService.getAssessmentAnalytics(z.guid().parse(assessmentId), request.currentUser!, assessmentAnalyticsQuery.parse(query));
  }

  @Post('assessments/:assessmentId/analytics/exports')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @Roles(...rolePolicies.assessmentAttemptsRead)
  @CourseScope('param', 'assessmentId', 'assessment')
  async startAnalyticsExport(@Param('assessmentId') assessmentId: string, @Req() request: AuthenticatedRequest,
    @Body() body: unknown, @Res({ passthrough: true }) response: { status(code: number): unknown }) {
    const result = await this.exports.start(z.guid().parse(assessmentId), request.currentUser!, assessmentExportInput.parse(body));
    if ('file' in result && result.file) return exportFile(result);
    response.status(202);
    return { statusUrl: `/assessments/${assessmentId}/analytics/exports/${result.id}` };
  }

  @Get('assessments/:assessmentId/analytics/exports/:id')
  @Header('Cache-Control', 'private, no-store')
  @Roles(...rolePolicies.assessmentAttemptsRead)
  @CourseScope('param', 'assessmentId', 'assessment')
  async getAnalyticsExportStatus(@Param('assessmentId') assessmentId: string, @Param('id') id: string, @Req() request: AuthenticatedRequest) {
    const result = await this.exports.status(z.guid().parse(assessmentId), exportId.parse(id), request.currentUser!);
    return {
      ...result,
      ...(result.state === 'completed' ? { downloadUrl: `/assessments/${assessmentId}/analytics/exports/${id}/file` } : {}),
    };
  }

  @Get('assessments/:assessmentId/analytics/exports/:id/file')
  @Header('Cache-Control', 'private, no-store')
  @Roles(...rolePolicies.assessmentAttemptsRead)
  @CourseScope('param', 'assessmentId', 'assessment')
  async downloadAnalyticsExport(@Param('assessmentId') assessmentId: string, @Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return exportFile(await this.exports.download(z.guid().parse(assessmentId), exportId.parse(id), request.currentUser!));
  }

  @Get('assessments/:assessmentId/report')
  @Roles(...rolePolicies.assessmentAttemptsRead)
  @CourseScope('param', 'assessmentId', 'assessment')
  getAssessmentReport(@Param('assessmentId') assessmentId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentResultsService.getAssessmentReport(assessmentId, request.currentUser!);
  }

  @Get('attempts/:id')
  @Roles(...rolePolicies.assessmentAttemptsRead)
  @CourseScope('param', 'id', 'attempt')
  getAttempt(@Param('id') attemptId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentAttemptsService.getAttempt(attemptId, request.currentUser!);
  }

  @Get('attempts/:id/result')
  @Roles(...rolePolicies.assessmentAttemptResultsRead)
  @CourseScope('param', 'id', 'attempt')
  getAttemptResult(@Param('id') attemptId: string, @Req() request: AuthenticatedRequest) {
    const currentUser = request.currentUser!;

    return this.assessmentResultsService.getAttemptResult(attemptId, currentUser);
  }

  @Post('assessments/:assessmentId/attempts/preview')
  @Roles(...rolePolicies.assessmentsCreate)
  @CourseScope('param', 'assessmentId', 'assessment')
  previewAttempt(
    @Param('assessmentId') assessmentId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const input: CreateAssessmentAttemptInput = createAssessmentAttemptSchema.parse(body);

    return this.assessmentAttemptsService.previewAttempt(assessmentId, request.currentUser!.organizationId, input);
  }

  @Post('assessments/:assessmentId/attempts/start')
  @Roles(...rolePolicies.assessmentAttemptsCreate)
  @CourseScope('param', 'assessmentId', 'assessment')
  async startAttempt(@Param('assessmentId') assessmentId: string, @Req() request: AuthenticatedRequest, @Query('placementId') placementId?: string, @Query('token') token?: string, @Query('draft') draft?: string, @Query('resume') resume?: string) {
    const placement = placementQuery.parse(placementId);
    if (placement !== undefined && isInstructorCourseScoped(request.currentUser!)) throw new ForbiddenException();
    const actor = request.currentUser!;
    await this.standalone.assertAccess(assessmentId, actor.organizationId, actor.id, assessmentLinkToken.optional().parse(token), placement === null, typeof placement === 'string');
    const attempt = await this.assessmentAttemptsService.startAttempt(
      assessmentId,
      request.currentUser!.id,
      request.currentUser!.organizationId,
      placement,
      draft === 'true',
      z.guid().optional().parse(resume),
    );
    return draft === 'true' ? { ...attempt, serverNow: new Date() } : attempt;
  }

  @Post('assessments/:assessmentId/attempts/answer')
  @Roles(...rolePolicies.assessmentAttemptsCreate)
  @CourseScope('param', 'assessmentId', 'assessment')
  async recordAnswer(@Param('assessmentId') assessmentId: string, @Req() request: AuthenticatedRequest,
    @Body() body: unknown, @Query('placementId') placementId?: string, @Query('token') token?: string) {
    const placement = placementQuery.parse(placementId);
    const actor = request.currentUser!;
    if (placement !== undefined && isInstructorCourseScoped(actor)) throw new ForbiddenException();
    await this.standalone.assertAccess(assessmentId, actor.organizationId, actor.id, assessmentLinkToken.optional().parse(token), placement === null, typeof placement === 'string');
    const { attemptId, answer } = recordAssessmentAnswerSchema.parse(body);
    return this.assessmentAttemptsService.recordAnswer(assessmentId, actor.id, actor.organizationId, attemptId, answer, placement);
  }

  @Post('assessments/:assessmentId/attempts')
  @Roles(...rolePolicies.assessmentAttemptsCreate)
  @CourseScope('param', 'assessmentId', 'assessment')
  async createAttempt(
    @Param('assessmentId') assessmentId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @Query('token') token?: string,
  ) {
    const input: CreateAssessmentAttemptInput = createAssessmentAttemptSchema.parse(body);

    if (input.placementId !== undefined && isInstructorCourseScoped(request.currentUser!)) throw new ForbiddenException();
    const actor = request.currentUser!;
    await this.standalone.assertAccess(assessmentId, actor.organizationId, actor.id, assessmentLinkToken.optional().parse(token), input.placementId === null, typeof input.placementId === 'string');
    return this.assessmentAttemptsService.createAttempt(
      assessmentId,
      request.currentUser!.id,
      request.currentUser!.organizationId,
      input,
    );
  }
}
