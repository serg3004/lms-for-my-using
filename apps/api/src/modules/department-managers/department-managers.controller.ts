import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

import {
  AuthGuard,
  OrganizationScope,
  OrganizationScopeGuard,
  Roles,
  rolePolicies,
  RolesGuard,
} from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { DepartmentManagersService } from './department-managers.service.js';
import { createDepartmentManagerSchema, updateManagerModesSchema } from './department-managers.schemas.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class DepartmentManagersController {
  constructor(private readonly departmentManagersService: DepartmentManagersService) {}

  @Get('departments/:id/managers')
  @Roles(...rolePolicies.departmentManagersRead)
  listEffectiveManagers(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.departmentManagersService.listEffectiveManagers(id, request.currentUser!.organizationId);
  }

  @Post('department-managers')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.departmentManagersWrite)
  @OrganizationScope('body', 'organizationId')
  createManager(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = createDepartmentManagerSchema.parse(body);
    return this.departmentManagersService.createManager(input, request.currentUser?.id ?? null);
  }

  @Post('department-managers/:id/close')
  @Roles(...rolePolicies.departmentManagersWrite)
  closeManager(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.departmentManagersService.closeManager(id, request.currentUser!.organizationId, request.currentUser!.id);
  }

  @Patch('departments/:id/manager-modes')
  @Roles(...rolePolicies.departmentManagersWrite)
  updateManagerModes(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateManagerModesSchema.parse(body);
    return this.departmentManagersService.updateManagerModes(id, request.currentUser!.organizationId, input, request.currentUser!.id);
  }
}
