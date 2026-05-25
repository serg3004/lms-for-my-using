import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import {
  CreateOrganizationInput,
  createOrganizationSchema,
} from './organizations.schemas.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.organizationsRead)
  listOrganizations() {
    return this.organizationsService.listOrganizations();
  }

  @Get(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.organizationsRead)
  getOrganization(@Param('id') organizationId: string) {
    return this.organizationsService.getOrganization(organizationId);
  }

  @Post()
  createOrganization(@Body() body: unknown) {
    const input: CreateOrganizationInput = createOrganizationSchema.parse(body);

    return this.organizationsService.createOrganization(input);
  }
}
