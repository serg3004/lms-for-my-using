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
import { PositionCoursesService } from './position-courses.service.js';
import { createPositionCourseSchema, listPositionCoursesQuerySchema, updatePositionCourseSchema } from './position-courses.schemas.js';

@Controller('position-courses')
@UseGuards(AuthGuard, RolesGuard)
export class PositionCoursesController {
  constructor(private readonly positionCoursesService: PositionCoursesService) {}

  @Get()
  @Roles(...rolePolicies.positionCoursesRead)
  listPositionCourses(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = listPositionCoursesQuerySchema.parse(query);
    return this.positionCoursesService.listPositionCourses(request.currentUser!.organizationId, parsed);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.positionCoursesWrite)
  @OrganizationScope('body', 'organizationId')
  createPositionCourse(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = createPositionCourseSchema.parse(body);
    return this.positionCoursesService.createPositionCourse(input, request.currentUser?.id ?? null);
  }

  @Get(':id')
  @Roles(...rolePolicies.positionCoursesRead)
  getPositionCourse(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.positionCoursesService.getPositionCourse(id, request.currentUser!.organizationId);
  }

  @Patch(':id')
  @Roles(...rolePolicies.positionCoursesWrite)
  updatePositionCourse(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updatePositionCourseSchema.parse(body);
    return this.positionCoursesService.updatePositionCourse(id, request.currentUser!.organizationId, input, request.currentUser!.id);
  }

  @Post(':id/archive')
  @Roles(...rolePolicies.positionCoursesWrite)
  archivePositionCourse(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.positionCoursesService.archivePositionCourse(id, request.currentUser!.organizationId, request.currentUser!.id);
  }

  @Post(':id/restore')
  @Roles(...rolePolicies.positionCoursesWrite)
  restorePositionCourse(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.positionCoursesService.restorePositionCourse(id, request.currentUser!.organizationId, request.currentUser!.id);
  }
}
