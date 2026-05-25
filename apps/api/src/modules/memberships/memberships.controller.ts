import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import {
  CreateMembershipInput,
  createMembershipSchema,
} from './memberships.schemas.js';
import { MembershipsService } from './memberships.service.js';

@Controller('memberships')
@UseGuards(AuthGuard, RolesGuard)
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  @Roles(...rolePolicies.membershipsRead)
  listMemberships(@Req() request: AuthenticatedRequest) {
    return this.membershipsService.listMemberships(request.currentUser!.organizationId);
  }

  @Get(':id')
  @Roles(...rolePolicies.membershipsRead)
  getMembership(@Param('id') membershipId: string, @Req() request: AuthenticatedRequest) {
    return this.membershipsService.getMembership(membershipId, request.currentUser!.organizationId);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.membershipsCreate)
  @OrganizationScope('body', 'organizationId')
  createMembership(@Body() body: unknown) {
    const input: CreateMembershipInput = createMembershipSchema.parse(body);

    return this.membershipsService.createMembership(input);
  }
}
