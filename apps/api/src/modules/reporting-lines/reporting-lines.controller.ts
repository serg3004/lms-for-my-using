import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

import {
  AuthGuard,
  OrganizationScope,
  OrganizationScopeGuard,
  Roles,
  rolePolicies,
  RolesGuard,
} from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { ReportingLinesService } from './reporting-lines.service.js';
import { createReportingLineSchema, updateReportingLineSchema } from './reporting-lines.schemas.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class ReportingLinesController {
  constructor(private readonly reportingLinesService: ReportingLinesService) {}

  @Get('users/:id/reporting-lines')
  @Roles(...rolePolicies.reportingLinesRead)
  listForUser(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.reportingLinesService.listForUser(id, request.currentUser!.organizationId);
  }

  @Get('users/:id/effective-manager')
  @Roles(...rolePolicies.reportingLinesRead)
  getEffectiveManager(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.reportingLinesService.getEffectiveManager(id, request.currentUser!.organizationId);
  }

  @Post('reporting-lines')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.reportingLinesWrite)
  @OrganizationScope('body', 'organizationId')
  createReportingLine(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = createReportingLineSchema.parse(body);
    return this.reportingLinesService.createReportingLine(input, request.currentUser?.id ?? null);
  }

  @Patch('reporting-lines/:id')
  @Roles(...rolePolicies.reportingLinesWrite)
  updateReportingLine(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateReportingLineSchema.parse(body);
    return this.reportingLinesService.updateReportingLine(id, request.currentUser!.organizationId, input, request.currentUser!.id);
  }

  @Post('reporting-lines/:id/close')
  @Roles(...rolePolicies.reportingLinesWrite)
  closeReportingLine(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.reportingLinesService.closeReportingLine(id, request.currentUser!.organizationId, request.currentUser!.id);
  }
}
