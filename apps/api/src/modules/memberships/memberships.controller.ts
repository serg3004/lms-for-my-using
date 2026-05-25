import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
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
  listMemberships() {
    return this.membershipsService.listMemberships();
  }

  @Get(':id')
  @Roles(...rolePolicies.membershipsRead)
  getMembership(@Param('id') membershipId: string) {
    return this.membershipsService.getMembership(membershipId);
  }

  @Post()
  @Roles(...rolePolicies.membershipsCreate)
  createMembership(@Body() body: unknown) {
    const input: CreateMembershipInput = createMembershipSchema.parse(body);

    return this.membershipsService.createMembership(input);
  }
}
