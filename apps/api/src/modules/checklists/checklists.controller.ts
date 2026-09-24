import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post, Delete, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthGuard } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { isLearnerOnly, OrganizationScope, OrganizationScopeGuard, Roles, rolePolicies } from '../auth/public.js';
import { RolesGuard } from '../auth/public.js';
import { MAX_BUFFERED_UPLOAD_SIZE_BYTES, UploadService, validateUploadFile } from '../upload/public.js';
import { ChecklistReviewAccessService } from './checklist-review-access.service.js';
import { ChecklistScaleService } from './checklist-scale.service.js';
import { ChecklistSessionService } from './checklist-session.service.js';
import type { ChecklistSessionAction, ChecklistSessionViewerContext } from './checklist-session.service.js';
import { ChecklistWorkplaceSettingsService } from './checklist-workplace-settings.service.js';
import { ChecklistsService } from './checklists.service.js';
import {
  assignChecklistSchema,
  assignChecklistReviewerSchema,
  bulkAssignChecklistSchema,
  bulkCreateChecklistSessionSchema,
  checklistListQuerySchema,
  checklistLocationCapturePointSchema,
  checklistSessionParticipantsQuerySchema,
  createChecklistItemGroupSchema,
  createChecklistItemSchema,
  createChecklistScaleSchema,
  createChecklistSchema,
  createChecklistSessionSchema,
  checklistSessionQuerySchema,
  checklistSessionTransitionSchema,
  reviewChecklistItemResultSchema,
  skipChecklistItemSchema,
  submitChecklistItemResultSchema,
  submitChecklistLocationCaptureSchema,
  submitChecklistSessionFeedbackSchema,
  updateChecklistItemGroupSchema,
  updateChecklistItemSchema,
  updateChecklistScaleSchema,
  updateChecklistSchema,
  updateChecklistSessionSchema,
  updateChecklistWorkplaceSettingsSchema,
  checklistAnalyticsQuerySchema,
  checklistManagerAnalyticsQuerySchema,
  checklistQueueQuerySchema,
  recalculateChecklistScoreSchema,
} from './checklists.schemas.js';
const ALLOWED_ITEM_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class ChecklistsController {
  constructor(
    private readonly checklistsService: ChecklistsService,
    private readonly uploadService: UploadService,
    private readonly reviewAccess: ChecklistReviewAccessService,
    private readonly workplaceSettings: ChecklistWorkplaceSettingsService,
    private readonly sessions: ChecklistSessionService,
    private readonly scales: ChecklistScaleService,
  ) {}

  // ---- Workplace-training settings (docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md) ----
  @Get('checklists/workplace-settings')
  @Roles(...rolePolicies.checklistWorkplaceSettingsRead)
  getWorkplaceSettings(@Req() request: AuthenticatedRequest) {
    return this.workplaceSettings.getSettings(request.currentUser!.organizationId);
  }
  @Patch('checklists/workplace-settings')
  @Roles(...rolePolicies.checklistWorkplaceSettingsWrite)
  updateWorkplaceSettings(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateChecklistWorkplaceSettingsSchema.parse(body);
    const user = request.currentUser!;
    return this.workplaceSettings.updateSettings(user.organizationId, input, user.id);
  }

  // ---- Templates ----
  @Get('checklists')
  @Roles(...rolePolicies.checklistsRead)
  listChecklists(@Query() rawQuery: unknown, @Req() request: AuthenticatedRequest) {
    const { status } = checklistListQuerySchema.parse(rawQuery);
    return this.checklistsService.listChecklists(request.currentUser!.organizationId, status);
  }

  @Get('checklists/analytics')
  @Roles(...rolePolicies.checklistReviewWrite)
  async getAnalytics(@Query() rawQuery: unknown, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    const scope = await this.reviewAccess.reviewQueueScope(user);
    return this.checklistsService.getAnalytics(user.organizationId, checklistAnalyticsQuerySchema.parse(rawQuery), scope);
  }

  @Get('checklists/manager-analytics')
  @Roles(...rolePolicies.checklistManagerAnalyticsRead)
  async getManagerAnalytics(@Query() rawQuery: unknown, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    const [scope, settings] = await Promise.all([
      this.reviewAccess.participantLearnerScope(user),
      this.workplaceSettings.getSettings(user.organizationId),
    ]);
    return this.checklistsService.getManagerAnalytics(
      user.organizationId,
      checklistManagerAnalyticsQuerySchema.parse(rawQuery),
      scope,
      { high: settings.highPerformanceThreshold, low: settings.lowThreshold },
    );
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
    return this.checklistsService.updateChecklist(checklistId, request.currentUser!.organizationId, input, request.currentUser!.id);
  }
  @Delete('checklists/:id')
  @Roles(...rolePolicies.checklistsCreate)
  deleteChecklist(@Param('id') checklistId: string, @Req() request: AuthenticatedRequest) {
    return this.checklistsService.deleteChecklist(checklistId, request.currentUser!.organizationId, request.currentUser!.id);
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

  // ---- Item groups (PR 296 observation-sheet builder) ----
  @Get('checklists/:checklistId/groups')
  @Roles(...rolePolicies.checklistsRead)
  listItemGroups(@Param('checklistId') checklistId: string, @Req() request: AuthenticatedRequest) {
    return this.checklistsService.listItemGroups(checklistId, request.currentUser!.organizationId);
  }
  @Post('checklists/:checklistId/groups')
  @Roles(...rolePolicies.checklistsCreate)
  createItemGroup(@Param('checklistId') checklistId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = createChecklistItemGroupSchema.parse(body);
    return this.checklistsService.createItemGroup(checklistId, request.currentUser!.organizationId, input);
  }
  @Patch('checklist-item-groups/:id')
  @Roles(...rolePolicies.checklistsCreate)
  updateItemGroup(@Param('id') groupId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateChecklistItemGroupSchema.parse(body);
    return this.checklistsService.updateItemGroup(groupId, request.currentUser!.organizationId, input);
  }
  @Post('checklist-item-groups/:id/copy')
  @Roles(...rolePolicies.checklistsCreate)
  copyItemGroup(@Param('id') groupId: string, @Req() request: AuthenticatedRequest) {
    return this.checklistsService.copyItemGroup(groupId, request.currentUser!.organizationId);
  }

  // ---- Evaluation scales (PR 293) ----
  @Get('checklist-scales')
  @Roles(...rolePolicies.checklistsRead)
  listScales(@Req() request: AuthenticatedRequest) {
    return this.scales.list(request.currentUser!.organizationId);
  }
  @Get('checklist-scales/:id')
  @Roles(...rolePolicies.checklistsRead)
  getScale(@Param('id') scaleId: string, @Req() request: AuthenticatedRequest) {
    return this.scales.get(scaleId, request.currentUser!.organizationId);
  }
  @Post('checklist-scales')
  @Roles(...rolePolicies.checklistsCreate)
  createScale(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = createChecklistScaleSchema.parse(body);
    const user = request.currentUser!;
    return this.scales.create(user.organizationId, input, user.id);
  }
  @Patch('checklist-scales/:id')
  @Roles(...rolePolicies.checklistsCreate)
  updateScale(@Param('id') scaleId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateChecklistScaleSchema.parse(body);
    const user = request.currentUser!;
    return this.scales.update(scaleId, user.organizationId, input, user.id);
  }
  @Post('checklist-scales/:id/archive')
  @Roles(...rolePolicies.checklistsCreate)
  archiveScale(@Param('id') scaleId: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    return this.scales.archive(scaleId, user.organizationId, user.id);
  }

  // ---- Assignment / instances ----
  @Post('checklists/:checklistId/instances')
  @Roles(...rolePolicies.checklistInstancesCreate)
  assignChecklist(@Param('checklistId') checklistId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = assignChecklistSchema.parse(body);
    return this.checklistsService.assignChecklist(checklistId, request.currentUser!.organizationId, input, request.currentUser!.id);
  }
  @Post('checklists/:checklistId/instances/bulk')
  @Roles(...rolePolicies.checklistInstancesCreate)
  bulkAssignChecklist(@Param('checklistId') checklistId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = bulkAssignChecklistSchema.parse(body);
    const actor = request.currentUser!;
    return this.checklistsService.bulkAssignChecklist(checklistId, actor.organizationId, input, actor.id, actor.roles);
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
  async listPendingReview(@Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    const scope = await this.reviewAccess.reviewQueueScope(user);
    return this.checklistsService.listPendingReview(user.organizationId, scope);
  }
  @Get('checklist-instances/review-queue')
  @Roles(...rolePolicies.checklistReviewWrite)
  async searchReviewQueue(@Query() rawQuery: unknown, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    const query = checklistQueueQuerySchema.parse(rawQuery);
    const scope = await this.reviewAccess.reviewQueueScope(user);
    return this.checklistsService.searchReviewQueue(user.organizationId, user.id, query, scope);
  }
  @Patch('checklist-instances/:id/reviewer')
  @Roles(...rolePolicies.checklistReviewWrite)
  async assignReviewer(@Param('id') instanceId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    await this.reviewAccess.assertReviewerCanAccess(user, instanceId);
    const { reviewerId } = assignChecklistReviewerSchema.parse(body);
    return this.checklistsService.assignReviewer(instanceId, user.organizationId, reviewerId, user.id);
  }
  @Get('checklist-instances/:id/events')
  @Roles(...rolePolicies.checklistInstancesRead)
  async listEvents(@Param('id') instanceId: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    if (!isLearnerOnly(user.roles)) await this.reviewAccess.assertReviewerCanAccess(user, instanceId);
    else {
      const instance = await this.checklistsService.getInstance(instanceId, user.organizationId);
      if (instance.userId !== user.id) throw new ForbiddenException('You can only view your own checklist assignment');
    }
    return this.checklistsService.listEvents(instanceId, user.organizationId);
  }
  @Get('checklist-instances/:id')
  @Roles(...rolePolicies.checklistInstancesRead)
  async getInstance(@Param('id') instanceId: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    const instance = await this.checklistsService.getInstance(instanceId, user.organizationId);
    if (instance.userId !== user.id && isLearnerOnly(user.roles)) {
      throw new ForbiddenException('You can only view your own checklist assignment');
    }
    if (!isLearnerOnly(user.roles)) {
      await this.reviewAccess.assertReviewerCanAccess(user, instanceId);
    }

    return instance;
  }
  @Patch('checklist-instances/:instanceId/items/:itemId')
  @Roles(...rolePolicies.checklistItemResultsWrite)
  async submitItemResult(
    @Param('instanceId') instanceId: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = submitChecklistItemResultSchema.parse(body);
    const user = request.currentUser!;
    if (!isLearnerOnly(user.roles)) {
      await this.reviewAccess.assertReviewerCanAccess(user, instanceId);
    }
    return this.checklistsService.submitItemResult(
      instanceId,
      itemId,
      user.organizationId,
      user.id,
      !isLearnerOnly(user.roles),
      input,
    );
  }
  @Post('checklist-instances/:instanceId/items/:itemId/skip')
  @Roles(...rolePolicies.checklistItemResultsWrite)
  async skipItem(
    @Param('instanceId') instanceId: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = skipChecklistItemSchema.parse(body);
    const user = request.currentUser!;
    if (!isLearnerOnly(user.roles)) {
      await this.reviewAccess.assertReviewerCanAccess(user, instanceId);
    }
    return this.checklistsService.skipItem(
      instanceId,
      itemId,
      user.organizationId,
      user.id,
      !isLearnerOnly(user.roles),
      input,
    );
  }
  @Post('checklist-instances/:instanceId/items/:itemId/photo')
  @Roles(...rolePolicies.checklistItemResultsWrite)
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_BUFFERED_UPLOAD_SIZE_BYTES } }),
  )
  async uploadItemPhoto(
    @Param('instanceId') instanceId: string,
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (!ALLOWED_ITEM_PHOTO_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Only image files (JPEG, PNG, GIF, WEBP) can be attached');
    }
    validateUploadFile(file);
    const user = request.currentUser!;
    const isPrivileged = !isLearnerOnly(user.roles);
    if (isPrivileged) {
      await this.reviewAccess.assertReviewerCanAccess(user, instanceId);
    }
    await this.checklistsService.assertInstanceWritable(
      instanceId,
      user.organizationId,
      user.id,
      isPrivileged,
    );
    const uploaded = await this.uploadService.uploadChecklistItemPhoto(file, user.organizationId, instanceId, itemId);
    try {
      return await this.checklistsService.attachItemPhoto(
        instanceId,
        itemId,
        user.organizationId,
        user.id,
        isPrivileged,
        uploaded,
      );
    } catch (error) {
      await this.uploadService.deleteObject(uploaded.objectKey).catch(() => undefined);
      throw error;
    }
  }
  @Get('checklist-instances/:instanceId/items/:itemId/photo')
  @Roles(...rolePolicies.checklistInstancesRead)
  async getItemPhoto(
    @Param('instanceId') instanceId: string,
    @Param('itemId') itemId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = request.currentUser!;
    if (!isLearnerOnly(user.roles)) {
      await this.reviewAccess.assertReviewerCanAccess(user, instanceId);
    }
    return this.checklistsService.getItemPhotoDownload(
      instanceId,
      itemId,
      user.organizationId,
      user.id,
      !isLearnerOnly(user.roles),
    );
  }
  @Post('checklist-instances/:instanceId/items/:itemId/review')
  @Roles(...rolePolicies.checklistReviewWrite)
  async reviewItemResult(
    @Param('instanceId') instanceId: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = reviewChecklistItemResultSchema.parse(body);
    const user = request.currentUser!;
    await this.reviewAccess.assertReviewerCanAccess(user, instanceId);
    return this.checklistsService.reviewItemResult(instanceId, itemId, user.organizationId, user.id, input);
  }

  // ---- Sessions (docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md, PR 289 lifecycle) ----
  @Post('checklist-sessions')
  @Roles(...rolePolicies.checklistSessionsManage)
  createSession(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = createChecklistSessionSchema.parse(body);
    const user = request.currentUser!;
    return this.sessions.create(user.organizationId, input, user.id);
  }
  @Post('checklist-sessions/bulk')
  @Roles(...rolePolicies.checklistSessionsManage)
  async bulkCreateSessions(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = bulkCreateChecklistSessionSchema.parse(body);
    const user = request.currentUser!;
    const learnerScope = await this.reviewAccess.participantLearnerScope(user);
    return this.sessions.bulkCreate(user.organizationId, input, user.id, learnerScope);
  }
  @Get('checklist-sessions')
  @Roles(...rolePolicies.checklistSessionsRead)
  async listSessions(@Query() rawQuery: unknown, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    const query = checklistSessionQuerySchema.parse(rawQuery);
    const [scope, viewer] = await Promise.all([this.reviewAccess.sessionScope(user), this.sessionViewerContext(user)]);
    return this.sessions.list(user.organizationId, query, scope, viewer);
  }
  // Admin "new session" wizard lookups (PR 292) -- registered before ':id' so 'participants'
  // is never swallowed as a session id.
  @Get('checklist-sessions/participants')
  @Roles(...rolePolicies.checklistSessionsManage)
  async listSessionParticipants(@Query() rawQuery: unknown, @Req() request: AuthenticatedRequest) {
    const query = checklistSessionParticipantsQuerySchema.parse(rawQuery);
    const user = request.currentUser!;
    const learnerScope = await this.reviewAccess.participantLearnerScope(user);
    return this.sessions.listParticipants(user.organizationId, query, learnerScope);
  }
  @Get('checklist-sessions/:id')
  @Roles(...rolePolicies.checklistSessionsRead)
  async getSession(@Param('id') sessionId: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    const [scope, viewer] = await Promise.all([this.reviewAccess.sessionScope(user), this.sessionViewerContext(user)]);
    return this.sessions.get(sessionId, user.organizationId, scope, viewer);
  }
  @Get('checklist-sessions/:id/events')
  @Roles(...rolePolicies.checklistSessionsRead)
  async listSessionEvents(@Param('id') sessionId: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    const scope = await this.reviewAccess.sessionScope(user);
    return this.sessions.listEvents(sessionId, user.organizationId, scope);
  }
  @Patch('checklist-sessions/:id')
  @Roles(...rolePolicies.checklistSessionsManage)
  async updateSession(@Param('id') sessionId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateChecklistSessionSchema.parse(body);
    const user = request.currentUser!;
    const scope = await this.reviewAccess.sessionScope(user);
    return this.sessions.update(sessionId, user.organizationId, input, user.id, scope);
  }
  @Post('checklist-sessions/:id/start')
  @Roles(...rolePolicies.checklistSessionsRun)
  transitionStart(@Param('id') sessionId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.transitionSession('start', sessionId, body, request);
  }
  @Post('checklist-sessions/:id/pause')
  @Roles(...rolePolicies.checklistSessionsRun)
  transitionPause(@Param('id') sessionId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.transitionSession('pause', sessionId, body, request);
  }
  @Post('checklist-sessions/:id/resume')
  @Roles(...rolePolicies.checklistSessionsRun)
  transitionResume(@Param('id') sessionId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.transitionSession('resume', sessionId, body, request);
  }
  @Post('checklist-sessions/:id/complete')
  @Roles(...rolePolicies.checklistSessionsRun)
  transitionComplete(@Param('id') sessionId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.transitionSession('complete', sessionId, body, request);
  }
  @Post('checklist-sessions/:id/cancel')
  @Roles(...rolePolicies.checklistSessionsManage)
  transitionCancel(@Param('id') sessionId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.transitionSession('cancel', sessionId, body, request);
  }
  @Post('checklist-sessions/:id/repeat')
  @Roles(...rolePolicies.checklistSessionsManage)
  async repeatSession(@Param('id') sessionId: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    const scope = await this.reviewAccess.sessionScope(user);
    return this.sessions.repeatSession(sessionId, user.organizationId, user.id, scope);
  }

  // ---- Structured feedback (PR 297 observer conduct screen) ----
  @Patch('checklist-sessions/:id/feedback')
  @Roles(...rolePolicies.checklistSessionsRun)
  async submitFeedback(@Param('id') sessionId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = submitChecklistSessionFeedbackSchema.parse(body);
    const user = request.currentUser!;
    const scope = await this.reviewAccess.sessionScope(user);
    return this.sessions.submitFeedback(sessionId, user.organizationId, input, user.id, scope);
  }

  // ---- Geolocation capture (PR 290) ----
  @Post('checklist-sessions/:id/location/:point')
  @Roles(...rolePolicies.checklistSessionsRun)
  async captureLocation(
    @Param('id') sessionId: string,
    @Param('point') point: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const capturePoint = checklistLocationCapturePointSchema.parse(point);
    const input = submitChecklistLocationCaptureSchema.parse(body);
    const user = request.currentUser!;
    const scope = await this.reviewAccess.sessionScope(user);
    return this.sessions.captureLocation(sessionId, user.organizationId, capturePoint, input, user.id, scope);
  }
  @Get('checklist-sessions/:id/location')
  @Roles(...rolePolicies.checklistSessionsRead)
  async listLocationCaptures(@Param('id') sessionId: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    const scope = await this.reviewAccess.sessionScope(user);
    return this.sessions.listLocationCaptures(sessionId, user.organizationId, scope, user.id, user.roles.includes('admin'));
  }

  // ---- PR 300: admin session report — auditable score recalculation ----
  @Post('checklist-sessions/:id/recalculate')
  @Roles(...rolePolicies.checklistScoreRecalculate)
  async recalculateScore(@Param('id') sessionId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = recalculateChecklistScoreSchema.parse(body);
    const user = request.currentUser!;
    const scope = await this.reviewAccess.sessionScope(user);
    return this.sessions.recalculateScore(sessionId, user.organizationId, input.reason, user.id, scope);
  }
  @Get('checklist-sessions/:id/score-revisions')
  @Roles(...rolePolicies.checklistSessionsRead)
  async listScoreRevisions(@Param('id') sessionId: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    const scope = await this.reviewAccess.sessionScope(user);
    return this.sessions.listScoreRevisions(sessionId, user.organizationId, scope);
  }

  private async transitionSession(
    action: ChecklistSessionAction,
    sessionId: string,
    body: unknown,
    request: AuthenticatedRequest,
  ) {
    const { version } = checklistSessionTransitionSchema.parse(body);
    const user = request.currentUser!;
    const scope = await this.reviewAccess.sessionScope(user);
    return this.sessions.transition(sessionId, user.organizationId, action, version, user.id, scope);
  }

  /**
   * PR 298: closes PR 286's unfinished "server-side enforcement" of `feedbackVisibility` for the
   * one read path that actually needs it -- the employee's own session list/detail. Only the
   * caller's own learner-ness and the tenant's policy matter here, never a per-session override.
   */
  private async sessionViewerContext(user: AuthenticatedRequest['currentUser']): Promise<ChecklistSessionViewerContext> {
    const settings = await this.workplaceSettings.getSettings(user!.organizationId);
    return { isLearnerOnly: isLearnerOnly(user!.roles), feedbackVisibility: settings.feedbackVisibility };
  }
}
