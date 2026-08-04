import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { PublicAccess, Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import {
  CreateOrganizationInput,
  RegisterOrganizationInput,
  ThemeSettingsInput,
  createOrganizationSchema,
  registerOrganizationSchema,
  themeSettingsSchema,
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
  @PublicAccess()
  registerOrganization(@Body() body: unknown) {
    const input: RegisterOrganizationInput = registerOrganizationSchema.parse(body);

    return this.organizationsService.registerOrganization(input);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.organizationsCreate)
  createOrganization(@Body() body: unknown) {
    const input: CreateOrganizationInput = createOrganizationSchema.parse(body);

    return this.organizationsService.createOrganization(input);
  }

  @Get(':id/theme')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.themeSettingsRead)
  @OrganizationScope('param', 'id')
  getThemeSettings(@Param('id') organizationId: string) {
    return this.organizationsService.getThemeSettings(organizationId);
  }

  @Patch(':id/theme')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.themeSettingsWrite)
  @OrganizationScope('param', 'id')
  updateThemeSettings(@Param('id') organizationId: string, @Body() body: unknown) {
    const input: ThemeSettingsInput = themeSettingsSchema.parse(body);

    return this.organizationsService.updateThemeSettings(organizationId, input);
  }

  @Delete(':id/theme')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.themeSettingsWrite)
  @OrganizationScope('param', 'id')
  resetThemeSettings(@Param('id') organizationId: string) {
    return this.organizationsService.resetThemeSettings(organizationId);
  }
}
