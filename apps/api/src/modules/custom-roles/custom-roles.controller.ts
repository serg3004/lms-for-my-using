import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, Roles, RolesGuard, rolePolicies } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { CustomRolesService } from './custom-roles.service.js';
import { archiveCustomRoleSchema, createCustomRoleSchema, listCustomRolesQuerySchema, updateCustomRoleSchema } from './custom-roles.schemas.js';

/** Role management (PR 484): administrator of the organization only. Granting roles is never delegated. */
@Controller('custom-roles')
@UseGuards(AuthGuard, RolesGuard)
export class CustomRolesController {
  constructor(private readonly roles: CustomRolesService) {}

  @Get()
  @Roles(...rolePolicies.customRolesManage)
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.roles.listRoles(request.currentUser!.organizationId, listCustomRolesQuerySchema.parse(query).state);
  }

  @Post()
  @Roles(...rolePolicies.customRolesManage)
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const user = request.currentUser!;
    return this.roles.createFrom(user.organizationId, createCustomRoleSchema.parse(body), user.id);
  }

  @Get('users/:userId/permissions')
  @Roles(...rolePolicies.customRolesManage)
  async userPermissions(@Req() request: AuthenticatedRequest, @Param('userId') userId: string) {
    const organizationId = request.currentUser!.organizationId;
    await this.roles.userExists(organizationId, userId);
    return this.roles.describeEffective(organizationId, userId);
  }

  @Get(':id')
  @Roles(...rolePolicies.customRolesManage)
  get(@Req() request: AuthenticatedRequest, @Param('id') roleId: string) {
    return this.roles.getRole(request.currentUser!.organizationId, roleId);
  }

  @Patch(':id')
  @Roles(...rolePolicies.customRolesManage)
  update(@Req() request: AuthenticatedRequest, @Param('id') roleId: string, @Body() body: unknown) {
    const user = request.currentUser!;
    return this.roles.updateRole(user.organizationId, roleId, updateCustomRoleSchema.parse(body), user.id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @Roles(...rolePolicies.customRolesManage)
  archive(@Req() request: AuthenticatedRequest, @Param('id') roleId: string, @Body() body: unknown) {
    const user = request.currentUser!;
    return this.roles.archiveAndRecord(user.organizationId, roleId, archiveCustomRoleSchema.parse(body).version, user.id);
  }

  @Get(':id/assignments')
  @Roles(...rolePolicies.customRolesManage)
  assignments(@Req() request: AuthenticatedRequest, @Param('id') roleId: string) {
    return this.roles.listAssignments(request.currentUser!.organizationId, roleId);
  }

  @Put(':id/assignments/:userId')
  @Roles(...rolePolicies.customRolesManage)
  assign(@Req() request: AuthenticatedRequest, @Param('id') roleId: string, @Param('userId') userId: string) {
    const user = request.currentUser!;
    return this.roles.assignAndRecord(user.organizationId, userId, roleId, user.id);
  }

  @Delete(':id/assignments/:userId')
  @HttpCode(204)
  @Roles(...rolePolicies.customRolesManage)
  async revoke(@Req() request: AuthenticatedRequest, @Param('id') roleId: string, @Param('userId') userId: string) {
    const user = request.currentUser!;
    await this.roles.revokeAndRecord(user.organizationId, userId, roleId, user.id);
  }
}
