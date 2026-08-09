import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { OrganizationScope } from '../auth/public.js';
import { OrganizationScopeGuard } from '../auth/public.js';
import { Roles, rolePolicies } from '../auth/public.js';
import { RolesGuard } from '../auth/public.js';
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
