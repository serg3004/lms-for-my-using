import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, Roles, RolesGuard, rolePolicies } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { isInstructorCourseScoped } from '../course-access/public.js';
import { AssessmentFoldersService } from './assessment-folders.service.js';
import { assessmentFolderShareCandidatesSchema, bulkAssessmentFolderSchema, createAssessmentFolderSchema, updateAssessmentFolderSchema } from './assessments.schemas.js';

@Controller('assessment-folders')
@UseGuards(AuthGuard, RolesGuard)
export class AssessmentFoldersController {
  constructor(private readonly folders: AssessmentFoldersService) {}

  @Get()
  @Roles(...rolePolicies.assessmentsCreate)
  list(@Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    return this.folders.list(user.organizationId, user, isInstructorCourseScoped(user) ? user.id : undefined);
  }

  @Get('share-candidates')
  @Roles(...rolePolicies.assessmentsCreate)
  shareCandidates(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.folders.shareCandidates(request.currentUser!.organizationId, assessmentFolderShareCandidatesSchema.parse(query).search);
  }

  @Post()
  @Roles(...rolePolicies.assessmentsCreate)
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    return this.folders.create(user.organizationId, user, createAssessmentFolderSchema.parse(body));
  }

  @Patch(':id')
  @Roles(...rolePolicies.assessmentsCreate)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    return this.folders.update(user.organizationId, id, user, updateAssessmentFolderSchema.parse(body));
  }

  @Get(':id/delete-impact')
  @Roles(...rolePolicies.assessmentsCreate)
  deleteImpact(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    return this.folders.deleteImpact(user.organizationId, id, user, isInstructorCourseScoped(user) ? user.id : undefined);
  }

  @Delete(':id')
  @Roles(...rolePolicies.assessmentsCreate)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    return this.folders.remove(user.organizationId, id, user, isInstructorCourseScoped(user) ? user.id : undefined);
  }

  @Post('bulk')
  @Roles(...rolePolicies.assessmentsCreate)
  bulk(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    return this.folders.bulk(user.organizationId, bulkAssessmentFolderSchema.parse(body), user, isInstructorCourseScoped(user) ? user.id : undefined);
  }
}
