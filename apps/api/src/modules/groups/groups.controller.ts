import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { OrganizationScope } from '../auth/public.js';
import { OrganizationScopeGuard } from '../auth/public.js';
import { Roles, rolePolicies } from '../auth/public.js';
import { RolesGuard } from '../auth/public.js';
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
  @Roles(...rolePolicies.groupsWrite)
  @OrganizationScope('body', 'organizationId')
  createGroup(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input: CreateGroupInput = createGroupSchema.parse(body);

    return this.groupsService.createGroup(input, request.currentUser?.id ?? null);
  }

  @Patch(':id')
  @Roles(...rolePolicies.groupsWrite)
  updateGroup(@Param('id') groupId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateGroupSchema.parse(body);
    return this.groupsService.updateGroup(groupId, request.currentUser!.organizationId, input, request.currentUser!.id);
  }

  @Get(':id/members')
  @Roles(...rolePolicies.groupsRead)
  listMembers(@Param('id') groupId: string, @Req() request: AuthenticatedRequest) {
    return this.groupsService.listMembers(groupId, request.currentUser!.organizationId);
  }

  @Post(':id/members')
  @Roles(...rolePolicies.groupMembersWrite)
  addMember(@Param('id') groupId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = assignGroupMemberSchema.parse(body);
    return this.groupsService.addMember(groupId, request.currentUser!.organizationId, input, request.currentUser!);
  }

  @Delete(':id/members/:userId')
  @Roles(...rolePolicies.groupMembersWrite)
  removeMember(@Param('id') groupId: string, @Param('userId') userId: string, @Req() request: AuthenticatedRequest) {
    return this.groupsService.removeMember(groupId, request.currentUser!.organizationId, userId, request.currentUser!);
  }

  @Get(':id/managers')
  @Roles(...rolePolicies.groupsRead)
  listManagers(@Param('id') groupId: string, @Req() request: AuthenticatedRequest) {
    return this.groupsService.listManagers(groupId, request.currentUser!.organizationId);
  }

  @Post(':id/managers')
  @Roles(...rolePolicies.groupManagersWrite)
  addManager(@Param('id') groupId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = assignGroupManagerSchema.parse(body);
    return this.groupsService.addManager(groupId, request.currentUser!.organizationId, input, request.currentUser!);
  }

  @Delete(':id/managers/:managerId')
  @Roles(...rolePolicies.groupManagersWrite)
  removeManager(@Param('id') groupId: string, @Param('managerId') managerId: string, @Req() request: AuthenticatedRequest) {
    return this.groupsService.removeManager(groupId, request.currentUser!.organizationId, managerId, request.currentUser!);
  }
}
