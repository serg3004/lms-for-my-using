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
import { DepartmentTypesService } from './department-types.service.js';
import { DepartmentsService } from './departments.service.js';
import {
  createDepartmentSchema,
  createDepartmentTypeSchema,
  departmentStatusFilterQuerySchema,
  listDepartmentsQuerySchema,
  moveDepartmentSchema,
  updateDepartmentSchema,
  updateDepartmentTypeSchema,
} from './departments.schemas.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class DepartmentsController {
  constructor(
    private readonly departmentsService: DepartmentsService,
    private readonly departmentTypesService: DepartmentTypesService,
  ) {}

  // ---- Tree (static paths declared before the ':id' routes they would otherwise shadow) ----

  @Get('departments/tree')
  @Roles(...rolePolicies.departmentsRead)
  getTree(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const { status } = departmentStatusFilterQuerySchema.parse(query);
    return this.departmentsService.getTree(request.currentUser!.organizationId, status);
  }

  @Get('departments')
  @Roles(...rolePolicies.departmentsRead)
  listDepartments(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = listDepartmentsQuerySchema.parse(query);
    return this.departmentsService.listDepartments(request.currentUser!.organizationId, parsed);
  }

  @Post('departments')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.departmentsWrite)
  @OrganizationScope('body', 'organizationId')
  createDepartment(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = createDepartmentSchema.parse(body);
    return this.departmentsService.createDepartment(input, request.currentUser?.id ?? null);
  }

  @Get('departments/:id')
  @Roles(...rolePolicies.departmentsRead)
  getDepartment(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.departmentsService.getDepartment(id, request.currentUser!.organizationId);
  }

  @Patch('departments/:id')
  @Roles(...rolePolicies.departmentsWrite)
  updateDepartment(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateDepartmentSchema.parse(body);
    return this.departmentsService.updateDepartment(id, request.currentUser!.organizationId, input, request.currentUser!.id);
  }

  @Get('departments/:id/children')
  @Roles(...rolePolicies.departmentsRead)
  getChildren(@Param('id') id: string, @Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const { status } = departmentStatusFilterQuerySchema.parse(query);
    return this.departmentsService.getChildren(id, request.currentUser!.organizationId, status);
  }

  @Get('departments/:id/path')
  @Roles(...rolePolicies.departmentsRead)
  getPath(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.departmentsService.getPath(id, request.currentUser!.organizationId);
  }

  @Post('departments/:id/move')
  @Roles(...rolePolicies.departmentsWrite)
  moveDepartment(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = moveDepartmentSchema.parse(body);
    return this.departmentsService.moveDepartment(id, request.currentUser!.organizationId, input, request.currentUser!.id);
  }

  @Post('departments/:id/archive')
  @Roles(...rolePolicies.departmentsWrite)
  archiveDepartment(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.departmentsService.archiveDepartment(id, request.currentUser!.organizationId, request.currentUser!.id);
  }

  @Post('departments/:id/restore')
  @Roles(...rolePolicies.departmentsWrite)
  restoreDepartment(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.departmentsService.restoreDepartment(id, request.currentUser!.organizationId, request.currentUser!.id);
  }

  // ---- Department types ----

  @Get('department-types')
  @Roles(...rolePolicies.departmentTypesRead)
  listDepartmentTypes(@Req() request: AuthenticatedRequest) {
    return this.departmentTypesService.listDepartmentTypes(request.currentUser!.organizationId);
  }

  @Post('department-types')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.departmentTypesWrite)
  @OrganizationScope('body', 'organizationId')
  createDepartmentType(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = createDepartmentTypeSchema.parse(body);
    return this.departmentTypesService.createDepartmentType(input, request.currentUser?.id ?? null);
  }

  @Patch('department-types/:id')
  @Roles(...rolePolicies.departmentTypesWrite)
  updateDepartmentType(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateDepartmentTypeSchema.parse(body);
    return this.departmentTypesService.updateDepartmentType(id, request.currentUser!.organizationId, input, request.currentUser!.id);
  }

  @Post('department-types/:id/archive')
  @Roles(...rolePolicies.departmentTypesWrite)
  archiveDepartmentType(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.departmentTypesService.archiveDepartmentType(id, request.currentUser!.organizationId, request.currentUser!.id);
  }

  @Post('department-types/:id/restore')
  @Roles(...rolePolicies.departmentTypesWrite)
  restoreDepartmentType(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.departmentTypesService.restoreDepartmentType(id, request.currentUser!.organizationId, request.currentUser!.id);
  }
}
