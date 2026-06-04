import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { createLessonSchema, CreateLessonInput, updateLessonStatusSchema, updateLessonSchema } from './lessons.schemas.js';
import { LessonsService } from './lessons.service.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get('courses/:courseId/lessons')
  @Roles(...rolePolicies.lessonsRead)
  listLessons(@Param('courseId') courseId: string, @Req() request: AuthenticatedRequest) {
    return this.lessonsService.listLessons(courseId, request.currentUser!.organizationId);
  }

  @Get('lessons/:id')
  @Roles(...rolePolicies.lessonsRead)
  getLesson(@Param('id') lessonId: string, @Req() request: AuthenticatedRequest) {
    return this.lessonsService.getLesson(lessonId, request.currentUser!.organizationId);
  }

  @Post('courses/:courseId/lessons')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.lessonsCreate)
  @OrganizationScope('body', 'organizationId')
  createLesson(@Param('courseId') courseId: string, @Body() body: unknown) {
    const input: CreateLessonInput = createLessonSchema.parse({
      ...(typeof body === 'object' && body !== null ? body : {}),
      courseId,
    });

    return this.lessonsService.createLesson(input);
  }

  @Patch('lessons/:id/status')
  @Roles(...rolePolicies.lessonsCreate)
  updateLessonStatus(@Param('id') lessonId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateLessonStatusSchema.parse(body);
    return this.lessonsService.updateLessonStatus(lessonId, request.currentUser!.organizationId, input.status);
  }

  @Patch('lessons/:id')
  @Roles(...rolePolicies.lessonsCreate)
  updateLesson(@Param('id') lessonId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateLessonSchema.parse(body);
    return this.lessonsService.updateLesson(lessonId, request.currentUser!.organizationId, input);
  }
}
