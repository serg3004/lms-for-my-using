import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { createCourseSchema, CreateCourseInput } from './courses.schemas.js';
import { CoursesService } from './courses.service.js';

@Controller('courses')
@UseGuards(AuthGuard, RolesGuard)
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @Roles(...rolePolicies.coursesRead)
  listCourses(@Req() request: AuthenticatedRequest) {
    return this.coursesService.listCourses(request.currentUser!.organizationId);
  }

  @Get(':id')
  @Roles(...rolePolicies.coursesRead)
  getCourse(@Param('id') courseId: string, @Req() request: AuthenticatedRequest) {
    return this.coursesService.getCourse(courseId, request.currentUser!.organizationId);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.coursesCreate)
  @OrganizationScope('body', 'organizationId')
  createCourse(@Body() body: unknown) {
    const input: CreateCourseInput = createCourseSchema.parse(body);

    return this.coursesService.createCourse(input);
  }
}
