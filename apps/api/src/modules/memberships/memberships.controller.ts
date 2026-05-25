import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import {
  CreateMembershipInput,
  createMembershipSchema,
} from './memberships.schemas.js';
import { MembershipsService } from './memberships.service.js';

@Controller('memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  listMemberships() {
    return this.membershipsService.listMemberships();
  }

  @Get(':id')
  getMembership(@Param('id') membershipId: string) {
    return this.membershipsService.getMembership(membershipId);
  }

  @Post()
  createMembership(@Body() body: unknown) {
    const input: CreateMembershipInput = createMembershipSchema.parse(body);

    return this.membershipsService.createMembership(input);
  }
}
