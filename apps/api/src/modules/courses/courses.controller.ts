import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { paginationQuerySchema } from '../../common/pagination.schema.js';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { isLearnerOnly, Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CourseAccessPolicy } from '../course-access/course-access.policy.js';
import {
  assignCourseInstructorSchema,
  createCourseSchema,
  CreateCourseInput,
  updateCourseSchema,
  UpdateCourseInput,
  updateCourseStatusSchema,
} from './courses.schemas.js';
import { CoursesService } from './courses.service.js';

@Controller('courses')
@UseGuards(AuthGuard, RolesGuard)
export class CoursesController {
  constructor(
    private readonly coursesService: CoursesService,
    private readonly courseAccess: CourseAccessPolicy,
  ) {}

  @Get()
  @Roles(...rolePolicies.coursesRead)
  listCourses(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    const { page, pageSize } = paginationQuerySchema.parse(query);
    const user = request.currentUser!;
    const instructorId = this.courseAccess.isInstructorScoped(user) ? user.id : undefined;
    return this.coursesService.listCourses(user.organizationId, page, pageSize, instructorId, isLearnerOnly(user.roles));
  }

  @Get(':id')
  @Roles(...rolePolicies.coursesRead)
  async getCourse(@Param('id') courseId: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    await this.courseAccess.assertCourseAccess(courseId, user);
    return this.coursesService.getCourse(courseId, user.organizationId, isLearnerOnly(user.roles));
  }

  @Get(':id/completion')
  @Roles(...rolePolicies.coursesRead)
  async getCourseCompletion(@Param('id') courseId: string, @Req() request: AuthenticatedRequest) {
    const currentUser = request.currentUser!;
    await this.courseAccess.assertCourseAccess(courseId, currentUser);
    return this.coursesService.getCourseCompletion(courseId, currentUser.id, currentUser.organizationId);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.coursesCreate)
  @OrganizationScope('body', 'organizationId')
  async createCourse(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input: CreateCourseInput = createCourseSchema.parse(body);

    return this.coursesService.createCourse(input, request.currentUser!);
  }

  @Patch(':id')
  @Roles(...rolePolicies.coursesCreate)
  async updateCourse(@Param('id') courseId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input: UpdateCourseInput = updateCourseSchema.parse(body);
    await this.courseAccess.assertCourseAccess(courseId, request.currentUser!);
    return this.coursesService.updateCourse(courseId, request.currentUser!.organizationId, input);
  }

  @Patch(':id/status')
  @Roles(...rolePolicies.coursesCreate)
  async updateCourseStatus(@Param('id') courseId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateCourseStatusSchema.parse(body);
    await this.courseAccess.assertCourseAccess(courseId, request.currentUser!);
    return this.coursesService.updateCourseStatus(courseId, request.currentUser!.organizationId, input.status);
  }

  @Delete(':id')
  @Roles(...rolePolicies.coursesCreate)
  async deleteCourse(@Param('id') courseId: string, @Req() request: AuthenticatedRequest) {
    await this.courseAccess.assertCourseAccess(courseId, request.currentUser!);
    return this.coursesService.deleteCourse(courseId, request.currentUser!.organizationId);
  }

  @Get(':id/instructors')
  @Roles(...rolePolicies.coursesRead)
  async listInstructors(@Param('id') courseId: string, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    await this.courseAccess.assertCourseAccess(courseId, user);
    return this.coursesService.listInstructors(courseId, user.organizationId);
  }

  @Post(':id/instructors')
  @Roles(...rolePolicies.coursesCreate)
  async addInstructor(@Param('id') courseId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const user = request.currentUser!;
    const input = assignCourseInstructorSchema.parse(body);
    await this.courseAccess.assertCourseAccess(courseId, user);
    return this.coursesService.addInstructor(courseId, user.organizationId, input);
  }

  @Delete(':id/instructors/:instructorId')
  @Roles(...rolePolicies.coursesCreate)
  async removeInstructor(
    @Param('id') courseId: string,
    @Param('instructorId') instructorId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = request.currentUser!;
    await this.courseAccess.assertCourseAccess(courseId, user);
    return this.coursesService.removeInstructor(courseId, user.organizationId, instructorId);
  }
}
