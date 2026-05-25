import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { createGroupSchema, CreateGroupInput } from './groups.schemas.js';
import { GroupsService } from './groups.service.js';

@Controller('groups')
@UseGuards(AuthGuard, RolesGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  @Roles(...rolePolicies.groupsRead)
  listGroups(@Req() request: AuthenticatedRequest) {
    return this.groupsService.listGroups(request.currentUser!.organizationId);
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
}
