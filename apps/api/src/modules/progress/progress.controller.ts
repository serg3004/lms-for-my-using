import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, isLearnerOnly, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { createProgressSchema, CreateProgressInput } from './progress.schemas.js';
import { ProgressService } from './progress.service.js';

@Controller('progress')
@UseGuards(AuthGuard, RolesGuard)
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get()
  @Roles(...rolePolicies.progressRead)
  listProgress(@Req() request: AuthenticatedRequest) {
    const currentUser = request.currentUser!;
    const userId = isLearnerOnly(currentUser.roles) ? currentUser.id : undefined;
    return this.progressService.listProgress(currentUser.organizationId, userId);
  }

  @Get(':id')
  @Roles(...rolePolicies.progressRead)
  getProgress(@Param('id') progressId: string, @Req() request: AuthenticatedRequest) {
    const currentUser = request.currentUser!;
    const userId = isLearnerOnly(currentUser.roles) ? currentUser.id : undefined;
    return this.progressService.getProgress(progressId, currentUser.organizationId, userId);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.progressCreate)
  @OrganizationScope('body', 'organizationId')
  createProgress(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const currentUser = request.currentUser!;
    const input: CreateProgressInput = createProgressSchema.parse(body);
    const safeInput = isLearnerOnly(currentUser.roles) ? { ...input, userId: currentUser.id } : input;

    return this.progressService.createProgress(safeInput);
  }
}
