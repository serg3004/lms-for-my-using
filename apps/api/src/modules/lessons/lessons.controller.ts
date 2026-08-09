import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { paginationQuerySchema } from '../../common/pagination.schema.js';
import { AuthGuard } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { OrganizationScope } from '../auth/public.js';
import { OrganizationScopeGuard } from '../auth/public.js';
import { Roles, rolePolicies } from '../auth/public.js';
import { RolesGuard } from '../auth/public.js';
import { CourseAccessGuard, CourseScope } from '../course-access/public.js';
import {
  createLessonSchema,
  CreateLessonInput,
  reorderLessonsSchema,
  ReorderLessonsInput,
  updateLessonStatusSchema,
  updateLessonSchema,
} from './lessons.schemas.js';
import { LessonsService } from './lessons.service.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard, CourseAccessGuard)
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get('lessons')
  @Roles(...rolePolicies.lessonsReadAll)
  listAllLessons(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const { page, pageSize } = paginationQuerySchema.parse(query);
    return this.lessonsService.listAllLessons(request.currentUser!.organizationId, page, pageSize);
  }

  @Get('courses/:courseId/lessons')
  @Roles(...rolePolicies.lessonsRead)
  @CourseScope('param', 'courseId')
  listLessons(@Param('courseId') courseId: string, @Req() request: AuthenticatedRequest) {
    return this.lessonsService.listLessons(courseId, request.currentUser!.organizationId);
  }

  @Get('lessons/:id')
  @Roles(...rolePolicies.lessonsRead)
  @CourseScope('param', 'id', 'lesson')
  getLesson(@Param('id') lessonId: string, @Req() request: AuthenticatedRequest) {
    return this.lessonsService.getLesson(lessonId, request.currentUser!.organizationId);
  }

  @Post('courses/:courseId/lessons')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.lessonsCreate)
  @OrganizationScope('body', 'organizationId')
  @CourseScope('param', 'courseId')
  createLesson(@Param('courseId') courseId: string, @Body() body: unknown) {
    const input: CreateLessonInput = createLessonSchema.parse({
      ...(typeof body === 'object' && body !== null ? body : {}),
      courseId,
    });

    return this.lessonsService.createLesson(input);
  }

  @Patch('courses/:courseId/lessons/order')
  @Roles(...rolePolicies.lessonsCreate)
  @CourseScope('param', 'courseId')
  reorderLessons(@Param('courseId') courseId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input: ReorderLessonsInput = reorderLessonsSchema.parse(body);

    return this.lessonsService.reorderLessons(courseId, request.currentUser!.organizationId, input.lessonIds);
  }

  @Patch('lessons/:id/status')
  @Roles(...rolePolicies.lessonsCreate)
  @CourseScope('param', 'id', 'lesson')
  updateLessonStatus(@Param('id') lessonId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateLessonStatusSchema.parse(body);
    return this.lessonsService.updateLessonStatus(lessonId, request.currentUser!.organizationId, input.status);
  }

  @Patch('lessons/:id')
  @Roles(...rolePolicies.lessonsCreate)
  @CourseScope('param', 'id', 'lesson')
  updateLesson(@Param('id') lessonId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateLessonSchema.parse(body);
    return this.lessonsService.updateLesson(lessonId, request.currentUser!.organizationId, input);
  }

  @Delete('lessons/:id')
  @Roles(...rolePolicies.lessonsCreate)
  @CourseScope('param', 'id', 'lesson')
  deleteLesson(@Param('id') lessonId: string, @Req() request: AuthenticatedRequest) {
    return this.lessonsService.deleteLesson(lessonId, request.currentUser!.organizationId);
  }
}
