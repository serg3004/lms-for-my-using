import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard.js';
import { OrganizationScope } from '../auth/organization-scope.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { Roles, rolePolicies } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import {
  createBulkUsersSchema,
  CreateBulkUsersInput,
  createUserSchema,
  CreateUserInput,
  importUsersSchema,
  ImportUsersInput,
  updateUserStatusSchema,
} from './users.schemas.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersRead)
  listUsers(@Req() request: AuthenticatedRequest) {
    return this.usersService.listUsers(request.currentUser!.organizationId);
  }

  @Get(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersRead)
  getUser(@Param('id') userId: string, @Req() request: AuthenticatedRequest) {
    return this.usersService.getUser(userId, request.currentUser!.organizationId);
  }

  @Post('bulk')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.usersCreate)
  @OrganizationScope('body', 'organizationId')
  createBulkUsers(@Body() body: unknown) {
    const input: CreateBulkUsersInput = createBulkUsersSchema.parse(body);

    return this.usersService.createBulkUsers(input);
  }

  @Post('import')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.usersCreate)
  @OrganizationScope('body', 'organizationId')
  importUsers(@Body() body: unknown) {
    const input: ImportUsersInput = importUsersSchema.parse(body);

    return this.usersService.importUsers(input);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.usersCreate)
  @OrganizationScope('body', 'organizationId')
  createUser(@Body() body: unknown) {
    const input: CreateUserInput = createUserSchema.parse(body);

    return this.usersService.createUser(input);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersCreate)
  updateUserStatus(@Param('id') userId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateUserStatusSchema.parse(body);

    return this.usersService.updateUserStatus(userId, request.currentUser!.organizationId, input.status);
  }
}
