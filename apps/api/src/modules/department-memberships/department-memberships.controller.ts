import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';

import {
  AuthGuard,
  OrganizationScope,
  OrganizationScopeGuard,
  Roles,
  rolePolicies,
  RolesGuard,
} from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { DepartmentMembershipsService } from './department-memberships.service.js';
import {
  bulkTransferSchema,
  createDepartmentMembershipSchema,
  departmentTransferSchema,
  listDepartmentUsersQuerySchema,
} from './department-memberships.schemas.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class DepartmentMembershipsController {
  constructor(private readonly departmentMembershipsService: DepartmentMembershipsService) {}

  @Get('departments/:id/users')
  @Roles(...rolePolicies.departmentMembershipsRead)
  listDepartmentUsers(@Param('id') id: string, @Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = listDepartmentUsersQuerySchema.parse(query);
    return this.departmentMembershipsService.listDepartmentUsers(id, request.currentUser!.organizationId, parsed);
  }

  @Get('users/:id/department-memberships')
  @Roles(...rolePolicies.departmentMembershipsRead)
  listUserMemberships(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.departmentMembershipsService.listUserMemberships(id, request.currentUser!.organizationId);
  }

  @Post('department-memberships')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.departmentMembershipsWrite)
  @OrganizationScope('body', 'organizationId')
  createMembership(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = createDepartmentMembershipSchema.parse(body);
    return this.departmentMembershipsService.createMembership(input, request.currentUser?.id ?? null);
  }

  @Post('department-memberships/:id/close')
  @Roles(...rolePolicies.departmentMembershipsWrite)
  closeMembership(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.departmentMembershipsService.closeMembership(id, request.currentUser!.organizationId, request.currentUser!.id);
  }

  @Post('users/:id/department-transfer')
  @Roles(...rolePolicies.departmentMembershipsWrite)
  transferDepartment(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = departmentTransferSchema.parse(body);
    return this.departmentMembershipsService.transferPrimaryDepartment(id, request.currentUser!.organizationId, input, request.currentUser!.id);
  }

  @Post('departments/:id/users/bulk-transfer')
  @Roles(...rolePolicies.departmentMembershipsWrite)
  bulkTransfer(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = bulkTransferSchema.parse(body);
    return this.departmentMembershipsService.bulkTransfer(id, request.currentUser!.organizationId, input, request.currentUser!.id);
  }
}
