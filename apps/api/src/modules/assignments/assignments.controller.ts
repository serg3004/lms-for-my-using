import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { paginationQuerySchema } from '../../common/pagination.schema.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, isLearnerOnly, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CourseAccessGuard, CourseScope } from '../course-access/course-access.guard.js';
import { isInstructorCourseScoped } from '../course-access/course-access.policy.js';
import { AssignmentsService } from './assignments.service.js';
import {
  createAssignmentSchema,
  CreateAssignmentInput,
  updateAssignmentStatusSchema,
} from './assignments.schemas.js';

@Controller('assignments')
@UseGuards(AuthGuard, RolesGuard, CourseAccessGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Get()
  @Roles(...rolePolicies.assignmentsRead)
  listAssignments(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    const currentUser = request.currentUser!;
    const userId = isLearnerOnly(currentUser.roles) ? currentUser.id : undefined;
    const { page, pageSize } = paginationQuerySchema.parse(query);
    if (isInstructorCourseScoped(currentUser)) {
      return this.assignmentsService.listAssignments(currentUser, userId, page, pageSize, currentUser.id);
    }
    return this.assignmentsService.listAssignments(currentUser, userId, page, pageSize);
  }

  @Get(':id')
  @Roles(...rolePolicies.assignmentsRead)
  @CourseScope('param', 'id', 'assignment')
  getAssignment(@Param('id') assignmentId: string, @Req() request: AuthenticatedRequest) {
    return this.assignmentsService.getAssignment(assignmentId, request.currentUser!);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.assignmentsCreate)
  @OrganizationScope('body', 'organizationId')
  @CourseScope('body', 'courseId')
  createAssignment(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input: CreateAssignmentInput = createAssignmentSchema.parse(body);

    return this.assignmentsService.createAssignment(input, request.currentUser!);
  }

  @Patch(':id/status')
  @Roles(...rolePolicies.assignmentsCreate)
  @CourseScope('param', 'id', 'assignment')
  updateAssignmentStatus(
    @Param('id') assignmentId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = updateAssignmentStatusSchema.parse(body);
    return this.assignmentsService.updateAssignmentStatus(
      assignmentId,
      request.currentUser!,
      input.status,
    );
  }
}
