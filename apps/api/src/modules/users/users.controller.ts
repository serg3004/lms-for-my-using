import { paginationQuerySchema } from '../../common/pagination.schema.js';

import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { OrganizationScope } from '../auth/public.js';
import { OrganizationScopeGuard } from '../auth/public.js';
import { Roles, rolePolicies } from '../auth/public.js';
import { RolesGuard } from '../auth/public.js';
import {
  createBulkUsersSchema,
  CreateBulkUsersInput,
  createUserRequestSchema,
  CreateUserRequestInput,
  importUsersSchema,
  ImportUsersInput,
  listUsersQuerySchema,
  invitationUserIdSchema,
  resendInvitationsSchema,
  updateUserSchema,
  UpdateUserInput,
  updateUserStatusSchema,
} from './users.schemas.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersRead)
  listUsers(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    const { page, pageSize, search, status } = listUsersQuerySchema.parse(query);
    return this.usersService.listUsers(request.currentUser!, page, pageSize, search, status);
  }

  @Get('invitations')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersCreate)
  listInvitations(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    const { page, pageSize } = paginationQuerySchema.parse(query);
    return this.usersService.listInvitations(request.currentUser!, page, pageSize);
  }

  @Post('invitations/resend')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersCreate)
  resendInvitations(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.usersService.resendInvitations(request.currentUser!, resendInvitationsSchema.parse(body).userIds);
  }

  @Post(':id/invitation/resend')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersCreate)
  resendInvitation(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.usersService.resendInvitation(request.currentUser!, invitationUserIdSchema.parse(id));
  }

  @Post(':id/invitation/revoke')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersCreate)
  revokeInvitation(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.usersService.changeInvitation(request.currentUser!, invitationUserIdSchema.parse(id), 'revoked');
  }

  @Post(':id/invitation/extend')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersCreate)
  extendInvitation(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.usersService.changeInvitation(request.currentUser!, invitationUserIdSchema.parse(id), 'extended');
  }

  @Get(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersRead)
  getUser(@Param('id') userId: string, @Req() request: AuthenticatedRequest) {
    return this.usersService.getUser(userId, request.currentUser!);
  }

  @Post('bulk')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.usersCreate)
  @OrganizationScope('body', 'organizationId')
  createBulkUsers(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input: CreateBulkUsersInput = createBulkUsersSchema.parse(body);

    return this.usersService.createBulkUsers(input, request.currentUser);
  }

  @Post('import')
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.usersImport)
  @OrganizationScope('body', 'organizationId')
  importUsers(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input: ImportUsersInput = importUsersSchema.parse(body);

    return this.usersService.importUsers(input, request.currentUser);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard, OrganizationScopeGuard)
  @Roles(...rolePolicies.usersCreate)
  @OrganizationScope('body', 'organizationId')
  createUser(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input: CreateUserRequestInput = createUserRequestSchema.parse(body);

    return this.usersService.createUser(input, request.currentUser?.id ?? null, request.currentUser);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersUpdate)
  updateUser(@Param('id') userId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input: UpdateUserInput = updateUserSchema.parse(body);

    return this.usersService.updateUser(userId, request.currentUser!, input);
  }

  @Get(':id/status-impact')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersDeactivate)
  getStatusImpact(@Param('id') userId: string, @Req() request: AuthenticatedRequest) {
    return this.usersService.getObserverSessionImpact(userId, request.currentUser!);
  }

  @Post(':id/reset-password')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersResetPassword)
  resetUserPassword(@Param('id') userId: string, @Req() request: AuthenticatedRequest) {
    return this.usersService.resetUserPassword(userId, request.currentUser!);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersDeactivate)
  updateUserStatus(@Param('id') userId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateUserStatusSchema.parse(body);

    return this.usersService.updateUserStatus(userId, request.currentUser!, input.status);
  }
}
