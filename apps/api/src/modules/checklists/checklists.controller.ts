import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Delete, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { isLearnerOnly, OrganizationScope, OrganizationScopeGuard, Roles, rolePolicies } from '../auth/public.js';
import { RolesGuard } from '../auth/public.js';
import { ChecklistsService } from './checklists.service.js';
import {
  assignChecklistSchema,
  createChecklistItemSchema,
  createChecklistSchema,
  reviewChecklistItemResultSchema,
  submitChecklistItemResultSchema,
  updateChecklistItemSchema,
  updateChecklistSchema,
} from './checklists.schemas.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class ChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  // ---- Templates ----

  @Get('checklists')
  @Roles(...rolePolicies.checklistsRead)
  listChecklists(@Req() request: AuthenticatedRequest) {
    return this.checklistsService.listChecklists(request.currentUser!.organizationId);
  }

  @Get('checklists/:id')
  @Roles(...rolePolicies.checklistsRead)
  getChecklist(@Param('id') checklistId: string, @Req() request: AuthenticatedRequest) {
    return this.checklistsService.getChecklist(checklistId, request.currentUser!.organizationId);
  }

  @Post('checklists')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.checklistsCreate)
  @OrganizationScope('body', 'organizationId')
  createChecklist(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = createChecklistSchema.parse(body);
    return this.checklistsService.createChecklist(input, request.currentUser!.id);
  }

  @Patch('checklists/:id')
  @Roles(...rolePolicies.checklistsCreate)
  updateChecklist(@Param('id') checklistId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateChecklistSchema.parse(body);
    return this.checklistsService.updateChecklist(checklistId, request.currentUser!.organizationId, input);
  }

  @Delete('checklists/:id')
  @Roles(...rolePolicies.checklistsCreate)
  deleteChecklist(@Param('id') checklistId: string, @Req() request: AuthenticatedRequest) {
    return this.checklistsService.deleteChecklist(checklistId, request.currentUser!.organizationId);
  }

  // ---- Items ----

  @Get('checklists/:checklistId/items')
  @Roles(...rolePolicies.checklistsRead)
  listItems(@Param('checklistId') checklistId: string, @Req() request: AuthenticatedRequest) {
    return this.checklistsService.listItems(checklistId, request.currentUser!.organizationId);
  }

  @Post('checklists/:checklistId/items')
  @Roles(...rolePolicies.checklistsCreate)
  createItem(@Param('checklistId') checklistId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = createChecklistItemSchema.parse(body);
    return this.checklistsService.createItem(checklistId, request.currentUser!.organizationId, input);
  }

  @Patch('checklist-items/:id')
  @Roles(...rolePolicies.checklistsCreate)
  updateItem(@Param('id') itemId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateChecklistItemSchema.parse(body);
    return this.checklistsService.updateItem(itemId, request.currentUser!.organizationId, input);
  }

  @Delete('checklist-items/:id')
  @Roles(...rolePolicies.checklistsCreate)
  deleteItem(@Param('id') itemId: string, @Req() request: AuthenticatedRequest) {
    return this.checklistsService.deleteItem(itemId, request.currentUser!.organizationId);
  }

  // ---- Assignment / instances ----

  @Post('checklists/:checklistId/instances')
  @Roles(...rolePolicies.checklistInstancesCreate)
  assignChecklist(@Param('checklistId') checklistId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = assignChecklistSchema.parse(body);
    return this.checklistsService.assignChecklist(checklistId, request.currentUser!.organizationId, input, request.currentUser!.id);
  }

  @Get('checklists/:checklistId/instances')
  @Roles(...rolePolicies.checklistsRead)
  listInstancesForChecklist(@Param('checklistId') checklistId: string, @Req() request: AuthenticatedRequest) {
    return this.checklistsService.listInstancesForChecklist(checklistId, request.currentUser!.organizationId);
  }

  @Get('checklist-instances/mine')
  @Roles(...rolePolicies.checklistInstancesRead)
  listMyInstances(@Req() request: AuthenticatedRequest) {
    return this.checklistsService.listMyInstances(request.currentUser!.id, request.currentUser!.organizationId);
  }

  @Get('checklist-instances/pending-review')
  @Roles(...rolePolicies.checklistReviewWrite)
  listPendingReview(@Req() request: AuthenticatedRequest) {
    return this.checklistsService.listPendingReview(request.currentUser!.organizationId);
  }

  @Get('checklist-instances/:id')
  @Roles(...rolePolicies.checklistInstancesRead)
  async getInstance(@Param('id') instanceId: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    const instance = await this.checklistsService.getInstance(instanceId, user.organizationId);

    if (instance.userId !== user.id && isLearnerOnly(user.roles)) {
      throw new ForbiddenException('You can only view your own checklist assignment');
    }

    return instance;
  }

  @Patch('checklist-instances/:instanceId/items/:itemId')
  @Roles(...rolePolicies.checklistItemResultsWrite)
  submitItemResult(
    @Param('instanceId') instanceId: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = submitChecklistItemResultSchema.parse(body);
    const user = request.currentUser!;
    return this.checklistsService.submitItemResult(
      instanceId,
      itemId,
      user.organizationId,
      user.id,
      !isLearnerOnly(user.roles),
      input,
    );
  }

  @Post('checklist-instances/:instanceId/items/:itemId/review')
  @Roles(...rolePolicies.checklistReviewWrite)
  reviewItemResult(
    @Param('instanceId') instanceId: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = reviewChecklistItemResultSchema.parse(body);
    const user = request.currentUser!;
    return this.checklistsService.reviewItemResult(instanceId, itemId, user.organizationId, user.id, input);
  }
}
