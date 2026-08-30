import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import {
  AuthGuard,
  OrganizationScope,
  OrganizationScopeGuard,
  Roles,
  rolePolicies,
  RolesGuard,
} from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { PositionsService } from './positions.service.js';
import { createPositionSchema, listPositionsQuerySchema, updatePositionSchema } from './positions.schemas.js';

@Controller('positions')
@UseGuards(AuthGuard, RolesGuard)
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Get()
  @Roles(...rolePolicies.positionsRead)
  listPositions(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = listPositionsQuerySchema.parse(query);
    return this.positionsService.listPositions(request.currentUser!.organizationId, parsed);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.positionsWrite)
  @OrganizationScope('body', 'organizationId')
  createPosition(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = createPositionSchema.parse(body);
    return this.positionsService.createPosition(input, request.currentUser?.id ?? null);
  }

  @Get(':id')
  @Roles(...rolePolicies.positionsRead)
  getPosition(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.positionsService.getPosition(id, request.currentUser!.organizationId);
  }

  @Patch(':id')
  @Roles(...rolePolicies.positionsWrite)
  updatePosition(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updatePositionSchema.parse(body);
    return this.positionsService.updatePosition(id, request.currentUser!.organizationId, input, request.currentUser!.id);
  }

  @Post(':id/archive')
  @Roles(...rolePolicies.positionsWrite)
  archivePosition(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.positionsService.archivePosition(id, request.currentUser!.organizationId, request.currentUser!.id);
  }

  @Post(':id/restore')
  @Roles(...rolePolicies.positionsWrite)
  restorePosition(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.positionsService.restorePosition(id, request.currentUser!.organizationId, request.currentUser!.id);
  }
}
