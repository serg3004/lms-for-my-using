import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import {
  assignGroupManagerSchema,
  assignGroupMemberSchema,
  createGroupSchema,
  CreateGroupInput,
  listGroupsQuerySchema,
  updateGroupSchema,
} from './groups.schemas.js';
import { GroupsService } from './groups.service.js';

@Controller('groups')
@UseGuards(AuthGuard, RolesGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  @Roles(...rolePolicies.groupsRead)
  listGroups(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    const { status } = listGroupsQuerySchema.parse(query);
    return this.groupsService.listGroups(request.currentUser!.organizationId, status);
  }

  @Get(':id')
  @Roles(...rolePolicies.groupsRead)
  getGroup(@Param('id') groupId: string, @Req() request: AuthenticatedRequest) {
    return this.groupsService.getGroup(groupId, request.currentUser!.organizationId);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.groupsCreate)
  @OrganizationScope('body', 'organizationId')
  createGroup(@Body() body: unknown) {
    const input: CreateGroupInput = createGroupSchema.parse(body);

    return this.groupsService.createGroup(input);
  }

  @Patch(':id')
  @Roles(...rolePolicies.groupsCreate)
  updateGroup(@Param('id') groupId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateGroupSchema.parse(body);
    return this.groupsService.updateGroup(groupId, request.currentUser!.organizationId, input);
  }

  @Get(':id/members')
  @Roles(...rolePolicies.groupsRead)
  listMembers(@Param('id') groupId: string, @Req() request: AuthenticatedRequest) {
    return this.groupsService.listMembers(groupId, request.currentUser!.organizationId);
  }

  @Post(':id/members')
  @Roles(...rolePolicies.groupsCreate)
  addMember(@Param('id') groupId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = assignGroupMemberSchema.parse(body);
    return this.groupsService.addMember(groupId, request.currentUser!.organizationId, input);
  }

  @Delete(':id/members/:userId')
  @Roles(...rolePolicies.groupsCreate)
  removeMember(@Param('id') groupId: string, @Param('userId') userId: string, @Req() request: AuthenticatedRequest) {
    return this.groupsService.removeMember(groupId, request.currentUser!.organizationId, userId);
  }

  @Get(':id/managers')
  @Roles(...rolePolicies.groupsRead)
  listManagers(@Param('id') groupId: string, @Req() request: AuthenticatedRequest) {
    return this.groupsService.listManagers(groupId, request.currentUser!.organizationId);
  }

  @Post(':id/managers')
  @Roles(...rolePolicies.groupsCreate)
  addManager(@Param('id') groupId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = assignGroupManagerSchema.parse(body);
    return this.groupsService.addManager(groupId, request.currentUser!.organizationId, input);
  }

  @Delete(':id/managers/:managerId')
  @Roles(...rolePolicies.groupsCreate)
  removeManager(@Param('id') groupId: string, @Param('managerId') managerId: string, @Req() request: AuthenticatedRequest) {
    return this.groupsService.removeManager(groupId, request.currentUser!.organizationId, managerId);
  }
}
