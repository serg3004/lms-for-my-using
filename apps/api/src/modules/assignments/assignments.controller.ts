import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

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
  listAssignments(@Req() request: AuthenticatedRequest) {
    const currentUser = request.currentUser!;
    const userId = isLearnerOnly(currentUser.roles) ? currentUser.id : undefined;
    return this.assignmentsService.listAssignments(currentUser.organizationId, userId);
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
