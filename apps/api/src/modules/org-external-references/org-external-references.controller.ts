import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, OrganizationScope, OrganizationScopeGuard, Roles, rolePolicies, RolesGuard } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { OrgExternalReferencesService } from './org-external-references.service.js';
import {
  createOrgExternalReferenceSchema,
  listOrgExternalReferencesQuerySchema,
  resolveOrgExternalReferenceQuerySchema,
} from './org-external-references.schemas.js';

@Controller('org-external-references')
@UseGuards(AuthGuard, RolesGuard)
export class OrgExternalReferencesController {
  constructor(private readonly service: OrgExternalReferencesService) {}

  @Post()
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.orgExternalReferencesWrite)
  @OrganizationScope('body', 'organizationId')
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = createOrgExternalReferenceSchema.parse(body);
    return this.service.create(input, request.currentUser?.id ?? null);
  }

  @Get()
  @Roles(...rolePolicies.orgExternalReferencesRead)
  list(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.service.list(request.currentUser!.organizationId, listOrgExternalReferencesQuerySchema.parse(query));
  }

  @Get('resolve')
  @Roles(...rolePolicies.orgExternalReferencesRead)
  resolve(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.service.resolve(request.currentUser!.organizationId, resolveOrgExternalReferenceQuerySchema.parse(query));
  }

  @Delete(':id')
  @Roles(...rolePolicies.orgExternalReferencesWrite)
  delete(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.service.delete(id, request.currentUser!.organizationId, request.currentUser?.id ?? null);
  }
}
