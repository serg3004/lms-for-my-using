import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthenticatedAccess, AuthGuard, type AuthenticatedRequest } from '../auth/public.js';
import { assessmentLinkToken, assignGrantsInput, assignmentInput, StandaloneAssessmentsService } from './standalone-assessments.service.js';

@Controller('assessments')
@UseGuards(AuthGuard)
export class StandaloneAssessmentsController {
  constructor(private readonly standalone: StandaloneAssessmentsService) {}

  @Get('standalone/mine')
  @AuthenticatedAccess()
  mine(@Req() request: AuthenticatedRequest) {
    const { id, organizationId } = request.currentUser!;
    return this.standalone.listMine(organizationId, id);
  }

  @Get(':id/standalone/access')
  @AuthenticatedAccess()
  async access(@Param('id') id: string, @Query('token') token: unknown, @Req() request: AuthenticatedRequest) {
    const actor = request.currentUser!;
    await this.standalone.assertAccess(z.guid().parse(id), actor.organizationId, actor.id, assessmentLinkToken.optional().parse(token), true);
    return { allowed: true };
  }

  // PR 584: rights are decided per test (administrator, author, manager for their team, roles and employees the author named).
  @Post(':id/standalone/assignments')
  @AuthenticatedAccess()
  async assign(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const actor = request.currentUser!;
    await this.standalone.assertCanAssign(z.guid().parse(id), actor);
    return this.standalone.assign(z.guid().parse(id), actor.organizationId, assignmentInput.parse(body), actor);
  }

  @Post(':id/standalone/link')
  @AuthenticatedAccess()
  async rotate(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    const actor = request.currentUser!;
    await this.standalone.assertCanAssign(z.guid().parse(id), actor, true);
    return this.standalone.setLink(z.guid().parse(id), actor.organizationId, true);
  }

  @Delete(':id/standalone/link')
  @AuthenticatedAccess()
  async revoke(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    const actor = request.currentUser!;
    await this.standalone.assertCanAssign(z.guid().parse(id), actor, true);
    return this.standalone.setLink(z.guid().parse(id), actor.organizationId, false);
  }

  @Get(':id/standalone/grants')
  @AuthenticatedAccess()
  grants(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.standalone.getGrants(z.guid().parse(id), request.currentUser!);
  }

  @Put(':id/standalone/grants')
  @AuthenticatedAccess()
  setGrants(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.standalone.setGrants(z.guid().parse(id), request.currentUser!, assignGrantsInput.parse(body));
  }
}
