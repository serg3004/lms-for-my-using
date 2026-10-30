import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { Roles, rolePolicies } from '../auth/public.js';
import { RolesGuard } from '../auth/public.js';
import { CourseAccessGuard, CourseScope } from '../course-access/public.js';
import { saveLongreadSchema } from './longreads.schemas.js';
import { LongreadsService } from './longreads.service.js';

const duplicateChapterSchema = z.object({ revision: z.number().int().min(1) }).strict();

/** The draft is for people who edit lessons; learners get the published version in PR 382/385. */
@Controller()
@UseGuards(AuthGuard, RolesGuard, CourseAccessGuard)
export class LongreadsController {
  constructor(private readonly longreadsService: LongreadsService) {}

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
}
