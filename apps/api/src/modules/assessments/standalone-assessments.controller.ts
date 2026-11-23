import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, Roles, RolesGuard, type AuthenticatedRequest } from '../auth/public.js';
import { assessmentLinkToken, assignmentInput, StandaloneAssessmentsService } from './standalone-assessments.service.js';

@Controller('assessments')
@UseGuards(AuthGuard)
export class StandaloneAssessmentsController {
  constructor(private readonly standalone: StandaloneAssessmentsService) {}

  @Get('standalone/mine')
  mine(@Req() request: AuthenticatedRequest) {
    const { id, organizationId } = request.currentUser!;
    return this.standalone.listMine(organizationId, id);
  }

  @Get(':id/standalone/access')
  async access(@Param('id') id: string, @Query('token') token: unknown, @Req() request: AuthenticatedRequest) {
    const actor = request.currentUser!;
    await this.standalone.assertAccess(z.guid().parse(id), actor.organizationId, actor.id, assessmentLinkToken.optional().parse(token), true);
    return { allowed: true };
  }

  @Post(':id/standalone/assignments')
  @UseGuards(RolesGuard)
  @Roles('admin')
  assign(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.standalone.assign(z.guid().parse(id), request.currentUser!.organizationId, assignmentInput.parse(body));
  }

  @Post(':id/standalone/link')
  @UseGuards(RolesGuard)
  @Roles('admin')
  rotate(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.standalone.setLink(z.guid().parse(id), request.currentUser!.organizationId, true);
  }

  @Delete(':id/standalone/link')
  @UseGuards(RolesGuard)
  @Roles('admin')
  revoke(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.standalone.setLink(z.guid().parse(id), request.currentUser!.organizationId, false);
  }
}
