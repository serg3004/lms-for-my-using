import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, Roles, RolesGuard, rolePolicies } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { isInstructorCourseScoped } from '../course-access/public.js';
import { AssessmentFoldersService } from './assessment-folders.service.js';
import { bulkAssessmentFolderSchema, createAssessmentFolderSchema, updateAssessmentFolderSchema } from './assessments.schemas.js';

@Controller('assessment-folders')
@UseGuards(AuthGuard, RolesGuard)
export class AssessmentFoldersController {
  constructor(private readonly folders: AssessmentFoldersService) {}

  @Get()
  @Roles(...rolePolicies.assessmentsCreate)
  list(@Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    return this.folders.list(user.organizationId, isInstructorCourseScoped(user) ? user.id : undefined);
  }

  @Post()
  @Roles(...rolePolicies.assessmentsCreate)
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    return this.folders.create(user.organizationId, user.id, createAssessmentFolderSchema.parse(body));
  }

  @Patch(':id')
  @Roles(...rolePolicies.assessmentsCreate)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.folders.update(request.currentUser!.organizationId, id, updateAssessmentFolderSchema.parse(body));
  }

  @Get(':id/delete-impact')
  @Roles(...rolePolicies.assessmentsCreate)
  deleteImpact(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    return this.folders.deleteImpact(user.organizationId, id, isInstructorCourseScoped(user) ? user.id : undefined);
  }

  @Delete(':id')
  @Roles(...rolePolicies.assessmentsCreate)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    return this.folders.remove(user.organizationId, id, isInstructorCourseScoped(user) ? user.id : undefined);
  }

  @Post('bulk')
  @Roles(...rolePolicies.assessmentsCreate)
  bulk(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    return this.folders.bulk(user.organizationId, bulkAssessmentFolderSchema.parse(body), isInstructorCourseScoped(user) ? user.id : undefined);
  }
}
