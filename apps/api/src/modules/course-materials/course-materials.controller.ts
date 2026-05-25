import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { createCourseMaterialSchema, CreateCourseMaterialInput } from './course-materials.schemas.js';
import { CourseMaterialsService } from './course-materials.service.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class CourseMaterialsController {
  constructor(private readonly courseMaterialsService: CourseMaterialsService) {}

  @Get('courses/:courseId/materials')
  @Roles(...rolePolicies.courseMaterialsRead)
  listCourseMaterials(@Param('courseId') courseId: string, @Req() request: AuthenticatedRequest) {
    return this.courseMaterialsService.listCourseMaterials(courseId, request.currentUser!.organizationId);
  }

  @Get('materials/:id')
  @Roles(...rolePolicies.courseMaterialsRead)
  getCourseMaterial(@Param('id') materialId: string, @Req() request: AuthenticatedRequest) {
    return this.courseMaterialsService.getCourseMaterial(materialId, request.currentUser!.organizationId);
  }

  @Post('courses/:courseId/materials')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.courseMaterialsCreate)
  @OrganizationScope('body', 'organizationId')
  createCourseMaterial(@Param('courseId') courseId: string, @Body() body: unknown) {
    const input: CreateCourseMaterialInput = createCourseMaterialSchema.parse({
      ...(typeof body === 'object' && body !== null ? body : {}),
      courseId,
    });

    return this.courseMaterialsService.createCourseMaterial(input);
  }
}
