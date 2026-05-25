import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import {
  CreateOrganizationInput,
  createOrganizationSchema,
} from './organizations.schemas.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  listOrganizations() {
    return this.organizationsService.listOrganizations();
  }

  @Get(':id')
  getOrganization(@Param('id') organizationId: string) {
    return this.organizationsService.getOrganization(organizationId);
  }

  @Post()
  createOrganization(@Body() body: unknown) {
    const input: CreateOrganizationInput = createOrganizationSchema.parse(body);

    return this.organizationsService.createOrganization(input);
  }
}
