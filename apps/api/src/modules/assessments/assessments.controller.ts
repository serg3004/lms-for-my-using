import { assessmentThemeSchema } from '@lms/shared/assessment-presentation';
import { Body, Controller, ForbiddenException, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import type { PermissionActionKey } from '@lms/shared/permission-catalog';
import { AuthGuard, EffectivePermissionsLookup, hasPermission } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { OrganizationScope } from '../auth/public.js';
import { OrganizationScopeGuard } from '../auth/public.js';
import { Roles, rolePolicies } from '../auth/public.js';
import { RolesGuard } from '../auth/public.js';
import { CourseAccessGuard, CourseAccessPolicy, CourseScope } from '../course-access/public.js';
import { isInstructorCourseScoped } from '../course-access/public.js';
import { gradeAssessmentAnswers } from '../../common/assessment-grading.js';
import { AssessmentsService } from './assessments.service.js';
import {
  assessmentLibrarySchema,
  saveAssessmentEditorSchema,
  previewAssessmentEditorSchema,
  createAssessmentSchema,
  assessmentPlacementSchema,
  CreateAssessmentInput,
  updateAssessmentStatusSchema,
  updateAssessmentSchema,
} from './assessments.schemas.js';

@Controller('assessments')
@UseGuards(AuthGuard, RolesGuard, CourseAccessGuard)
export class AssessmentsController {
  constructor(
    private readonly assessmentsService: AssessmentsService,
    private readonly permissions: EffectivePermissionsLookup,
    private readonly courseAccess: CourseAccessPolicy,
  ) {}

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
    return this.assessmentsService.listLibrary(user.organizationId, user, isInstructorCourseScoped(user), assessmentLibrarySchema.parse(query));
  }

  @Patch('default-theme')
  @Roles('admin')
  setDefaultTheme(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.assessmentsService.setDefaultTheme(request.currentUser!.organizationId, assessmentThemeSchema.parse(body));
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

  @Get(':id/editor')
  @Roles(...rolePolicies.assessmentsCreate)
  async getEditor(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    await this.assertEditorAccess(id, user, ['assessment.author', 'assessment.question.read', 'assessment.option.read']);
    return this.assessmentsService.getEditor(id, user.organizationId);
  }

  @Patch(':id/editor')
  @Roles(...rolePolicies.assessmentsCreate)
  async saveEditor(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    await this.assertEditorAccess(id, user, ['assessment.author', 'assessment.question.edit', 'assessment.option.edit']);
    return this.assessmentsService.saveEditor(id, user.organizationId, saveAssessmentEditorSchema.parse(body), user.id);
  }

  private async assertEditorAccess(id: string, user: NonNullable<AuthenticatedRequest['currentUser']>, actions: PermissionActionKey[]) {
    if (user.roles.includes('admin')) return;
    const permissions = await this.permissions.forUser(user);
    if (!actions.every((action) => hasPermission(permissions, action))) throw new ForbiddenException();
    if (actions.some((action) => !permissions.get(action)?.scopes.has('organization'))) {
      await this.courseAccess.assertResourceAccess('assessment', id, { ...user, roles: ['instructor'] });
    }
  }

  @Post(':id/editor/preview')
  @Roles(...rolePolicies.assessmentsCreate)
  @CourseScope('param', 'id', 'assessment')
  async previewEditor(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    await this.assessmentsService.getAssessment(id, request.currentUser!.organizationId);
    const { content, answers, questionIds } = previewAssessmentEditorSchema.parse(body);
    const questions = content.questions.filter((question) => questionIds.includes(question.id));
    return gradeAssessmentAnswers(questions, answers, content.settings.mode === 'survey');
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
