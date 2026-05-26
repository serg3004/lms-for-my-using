import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AssessmentAttemptsService } from './assessment-attempts.service.js';
import {
  createAssessmentAttemptSchema,
  CreateAssessmentAttemptInput,
} from './assessment-attempts.schemas.js';
import { AssessmentResultsService } from './assessment-results.service.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class AssessmentAttemptsController {
  constructor(
    private readonly assessmentAttemptsService: AssessmentAttemptsService,
    private readonly assessmentResultsService: AssessmentResultsService,
  ) {}

  @Get('assessments/:assessmentId/attempts')
  @Roles(...rolePolicies.assessmentAttemptsRead)
  listAttempts(@Param('assessmentId') assessmentId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentAttemptsService.listAttempts(assessmentId, request.currentUser!.organizationId);
  }

  @Get('assessments/:assessmentId/results')
  @Roles(...rolePolicies.assessmentAttemptsRead)
  listAssessmentResults(@Param('assessmentId') assessmentId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentResultsService.listAssessmentResults(assessmentId, request.currentUser!.organizationId);
  }

  @Get('assessments/:assessmentId/report')
  @Roles(...rolePolicies.assessmentAttemptsRead)
  getAssessmentReport(@Param('assessmentId') assessmentId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentResultsService.getAssessmentReport(assessmentId, request.currentUser!.organizationId);
  }

  @Get('attempts/:id')
  @Roles(...rolePolicies.assessmentAttemptsRead)
  getAttempt(@Param('id') attemptId: string, @Req() request: AuthenticatedRequest) {
    return this.assessmentAttemptsService.getAttempt(attemptId, request.currentUser!.organizationId);
  }

  @Get('attempts/:id/result')
  @Roles(...rolePolicies.assessmentAttemptResultsRead)
  getAttemptResult(@Param('id') attemptId: string, @Req() request: AuthenticatedRequest) {
    const currentUser = request.currentUser!;

    return this.assessmentResultsService.getAttemptResult(attemptId, currentUser.id, currentUser.organizationId);
  }

  @Post('assessments/:assessmentId/attempts')
  @Roles(...rolePolicies.assessmentAttemptsCreate)
  createAttempt(
    @Param('assessmentId') assessmentId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const input: CreateAssessmentAttemptInput = createAssessmentAttemptSchema.parse(body);

    return this.assessmentAttemptsService.createAttempt(
      assessmentId,
      request.currentUser!.id,
      request.currentUser!.organizationId,
      input,
    );
  }
}
