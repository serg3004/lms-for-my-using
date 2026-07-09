import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { paginationQuerySchema } from '../../common/pagination.schema.js';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, isLearnerOnly, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AssignmentsService } from './assignments.service.js';
import {
  createAssignmentSchema,
  CreateAssignmentInput,
  updateAssignmentStatusSchema,
} from './assignments.schemas.js';

@Controller('assignments')
@UseGuards(AuthGuard, RolesGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Get()
  @Roles(...rolePolicies.assignmentsRead)
  listAssignments(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    const currentUser = request.currentUser!;
    const userId = isLearnerOnly(currentUser.roles) ? currentUser.id : undefined;
    const { page, pageSize } = paginationQuerySchema.parse(query);
    return this.assignmentsService.listAssignments(currentUser.organizationId, userId, page, pageSize);
  }

  @Get(':id')
  @Roles(...rolePolicies.assignmentsRead)
  getAssignment(@Param('id') assignmentId: string, @Req() request: AuthenticatedRequest) {
    return this.assignmentsService.getAssignment(assignmentId, request.currentUser!.organizationId);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.assignmentsCreate)
  @OrganizationScope('body', 'organizationId')
  createAssignment(@Body() body: unknown) {
    const input: CreateAssignmentInput = createAssignmentSchema.parse(body);

    return this.assignmentsService.createAssignment(input);
  }

  @Patch(':id/status')
  @Roles(...rolePolicies.assignmentsCreate)
  updateAssignmentStatus(
    @Param('id') assignmentId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = updateAssignmentStatusSchema.parse(body);
    return this.assignmentsService.updateAssignmentStatus(
      assignmentId,
      request.currentUser!.organizationId,
      input.status,
    );
  }
}
