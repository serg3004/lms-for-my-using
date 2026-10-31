import { LongreadReaderService } from './longread-reader.service.js';
import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { Roles, rolePolicies } from '../auth/public.js';
import { RolesGuard } from '../auth/public.js';
import { CourseAccessGuard, CourseScope } from '../course-access/public.js';
import { longreadPositionSchema, longreadPreviewQuerySchema, longreadReaderQuerySchema, saveLongreadSchema } from './longreads.schemas.js';
import { LongreadVersionsService } from './longread-versions.service.js';
import { LongreadsService } from './longreads.service.js';

const duplicateChapterSchema = z.object({ revision: z.number().int().min(1) }).strict();
/** `revision` is the draft revision the author saw: publishing or restoring a draft that changed since is a 409. */
const draftRevisionSchema = duplicateChapterSchema;

/** The draft is for people who edit lessons; learners get the published version in PR 382/385. */
@Controller()
@UseGuards(AuthGuard, RolesGuard, CourseAccessGuard)
export class LongreadsController {
  constructor(
    private readonly longreadsService: LongreadsService,
    private readonly versions: LongreadVersionsService,
    private readonly reader: LongreadReaderService,
  ) {}

  @Get('lessons/:id/longread')
  @Roles(...rolePolicies.lessonsCreate)
  @CourseScope('param', 'id', 'lesson')
  getDraft(@Param('id', ParseUUIDPipe) lessonId: string, @Req() request: AuthenticatedRequest) {
    return this.longreadsService.getDraft(lessonId, request.currentUser!.organizationId);
  }

  @Put('lessons/:id/longread')
  @Roles(...rolePolicies.lessonsCreate)
  @CourseScope('param', 'id', 'lesson')
  saveDraft(@Param('id', ParseUUIDPipe) lessonId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = saveLongreadSchema.parse(body);
    return this.longreadsService.saveDraft(lessonId, request.currentUser!.organizationId, input, request.currentUser!.id);
  }

  @Post('lessons/:id/longread/chapters/:chapterId/duplicate')
  @Roles(...rolePolicies.lessonsCreate)
  @CourseScope('param', 'id', 'lesson')
  duplicateChapter(
    @Param('id', ParseUUIDPipe) lessonId: string,
    @Param('chapterId', ParseUUIDPipe) chapterId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const { revision } = duplicateChapterSchema.parse(body);
    return this.longreadsService.duplicateChapter(lessonId, chapterId, request.currentUser!.organizationId, revision, request.currentUser!.id);
  }

  @Get('lessons/:id/longread/publish-check')
  @Roles(...rolePolicies.lessonsCreate)
  @CourseScope('param', 'id', 'lesson')
  publishCheck(@Param('id', ParseUUIDPipe) lessonId: string, @Req() request: AuthenticatedRequest) {
    return this.versions.publishCheck(lessonId, request.currentUser!.organizationId);
  }

  @Post('lessons/:id/longread/publish')
  @Roles(...rolePolicies.lessonsCreate)
  @CourseScope('param', 'id', 'lesson')
  publish(@Param('id', ParseUUIDPipe) lessonId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const { revision } = draftRevisionSchema.parse(body);
    return this.versions.publish(lessonId, request.currentUser!.organizationId, revision, request.currentUser!.id);
  }

  @Post('lessons/:id/longread/unpublish')
  @Roles(...rolePolicies.lessonsCreate)
  @CourseScope('param', 'id', 'lesson')
  unpublish(@Param('id', ParseUUIDPipe) lessonId: string, @Req() request: AuthenticatedRequest) {
    return this.versions.unpublish(lessonId, request.currentUser!.organizationId, request.currentUser!.id);
  }

  @Get('lessons/:id/longread/versions')
  @Roles(...rolePolicies.lessonsCreate)
  @CourseScope('param', 'id', 'lesson')
  listVersions(@Param('id', ParseUUIDPipe) lessonId: string, @Req() request: AuthenticatedRequest) {
    return this.versions.listVersions(lessonId, request.currentUser!.organizationId);
  }

  @Post('lessons/:id/longread/versions/:number/restore')
  @Roles(...rolePolicies.lessonsCreate)
  @CourseScope('param', 'id', 'lesson')
  restoreVersion(
    @Param('id', ParseUUIDPipe) lessonId: string,
    @Param('number', ParseIntPipe) number: number,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const { revision } = draftRevisionSchema.parse(body);
    return this.versions.restoreVersion(lessonId, request.currentUser!.organizationId, number, revision, request.currentUser!.id);
  }

  /** The only longread read open to learners: published content only, never the draft. */
  @Get('lessons/:id/longread/published')
  @Roles(...rolePolicies.lessonsRead)
  @CourseScope('param', 'id', 'lesson')
  readPublished(@Param('id', ParseUUIDPipe) lessonId: string, @Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.reader.read(lessonId, request.currentUser!, longreadReaderQuerySchema.parse(query).chapter);
  }
  @Put('lessons/:id/longread/position')
  @Roles(...rolePolicies.lessonsRead)
  @CourseScope('param', 'id', 'lesson')
  saveReadingPosition(@Param('id', ParseUUIDPipe) lessonId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.reader.position(lessonId, request.currentUser!, longreadPositionSchema.parse(body));
  }

  @Get('lessons/:id/longread/preview')
  @Roles(...rolePolicies.lessonsCreate)
  @CourseScope('param', 'id', 'lesson')
  preview(@Param('id', ParseUUIDPipe) lessonId: string, @Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.reader.preview(lessonId, request.currentUser!.organizationId, longreadPreviewQuerySchema.parse(query).chapterId);
  }

}
