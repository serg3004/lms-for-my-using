import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import {
  CreateOrganizationInput,
  RegisterOrganizationInput,
  createOrganizationSchema,
  registerOrganizationSchema,
} from './organizations.schemas.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.organizationsRead)
  listOrganizations(@Req() request: AuthenticatedRequest) {
    return this.organizationsService.listOrganizations(request.currentUser!.organizationId);
  }

  @Get(':id')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.organizationsRead)
  @OrganizationScope('param', 'id')
  getOrganization(@Param('id') organizationId: string) {
    return this.organizationsService.getOrganization(organizationId);
  }

  @Post('register')
  registerOrganization(@Body() body: unknown) {
    const input: RegisterOrganizationInput = registerOrganizationSchema.parse(body);

    return this.organizationsService.registerOrganization(input);
  }

  @Post()
  createOrganization(@Body() body: unknown) {
    const input: CreateOrganizationInput = createOrganizationSchema.parse(body);

    return this.organizationsService.createOrganization(input);
  }
}
