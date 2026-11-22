import { paginationQuerySchema } from '../../common/pagination.schema.js';

import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';

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
  sharedActivationQrSchema,
  updateUserSchema,
  UpdateUserInput,
  updateUserStatusSchema,
  bulkActionSchema,
  bulkImpactSchema,
} from './users.schemas.js';
import { UsersBulkService } from './users-bulk.service.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService, private readonly bulkService: UsersBulkService) {}

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersRead)
  listUsers(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    const { page, pageSize, search, status, fieldKey, fieldValue } = listUsersQuerySchema.parse(query);
    return this.usersService.listUsers(request.currentUser!, page, pageSize, search, status, fieldKey !== undefined && fieldValue !== undefined ? { key: fieldKey, value: fieldValue } : undefined);
  }

  @Get('invitations')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersCreate)
  listInvitations(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    const { page, pageSize } = paginationQuerySchema.parse(query);
    return this.usersService.listInvitations(request.currentUser!, page, pageSize);
  }

  /** PR 497: one action over many users, with a report per person. A manager is limited to their team and cannot archive. */
  @Post('bulk-actions')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersDeactivate)
  runBulkAction(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.bulkService.run(request.currentUser!, bulkActionSchema.parse(body));
  }

  @Post('bulk-actions/impact')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersDeactivate)
  bulkImpact(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.bulkService.impact(request.currentUser!, bulkImpactSchema.parse(body));
  }

  @Get('activation-qr/shared')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.departmentsWrite)
  getSharedActivationQr(@Req() request: AuthenticatedRequest, @Query('departmentId') departmentId?: string) {
    return this.usersService.getSharedActivationQr(request.currentUser!, departmentId === undefined ? undefined : invitationUserIdSchema.parse(departmentId));
  }

  @Post('activation-qr/shared')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.departmentsWrite)
  rotateSharedActivationQr(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const { departmentId } = sharedActivationQrSchema.parse(body);
    return this.usersService.rotateSharedActivationQr(request.currentUser!, departmentId);
  }

  @Post('activation-qr/personal')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersCreate)
  issuePersonalActivationQrs(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.usersService.issuePersonalActivationQrs(request.currentUser!, resendInvitationsSchema.parse(body).userIds);
  }

  @Delete(':id/activation-qr')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersCreate)
  revokePersonalActivationQr(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.usersService.revokePersonalActivationQr(request.currentUser!, invitationUserIdSchema.parse(id));
  }

  @Post('invitations/resend')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersCreate)
  resendInvitations(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.usersService.resendInvitations(request.currentUser!, resendInvitationsSchema.parse(body).userIds);
  }

  @Get('telegram-delivery')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersCreate)
  getTelegramStatus(@Req() request: AuthenticatedRequest) {
    return this.usersService.telegramStatus(request.currentUser!);
  }

  @Get(':id/deliveries')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersCreate)
  listDeliveries(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.usersService.telegramHistory(request.currentUser!, invitationUserIdSchema.parse(id));
  }

  @Post(':id/telegram/invitation')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersCreate)
  sendInvitationToTelegram(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.usersService.sendToTelegram(request.currentUser!, invitationUserIdSchema.parse(id), 'invitation');
  }

  @Post(':id/telegram/temporary-password')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersResetPassword)
  sendTemporaryPasswordToTelegram(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.usersService.sendToTelegram(request.currentUser!, invitationUserIdSchema.parse(id), 'temporary_password');
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

  @Get('locked')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersResetPassword)
  listLockedUsers(@Req() request: AuthenticatedRequest) {
    return this.usersService.listLockedUsers(request.currentUser!);
  }

  @Get(':id/login-history')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersResetPassword)
  getLoginHistory(@Param('id') userId: string, @Req() request: AuthenticatedRequest) {
    return this.usersService.getLoginHistory(userId, request.currentUser!);
  }

  @Delete(':id/sessions/:sessionId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersResetPassword)
  revokeUserSession(@Param('id') userId: string, @Param('sessionId') sessionId: string, @Req() request: AuthenticatedRequest) {
    return this.usersService.revokeUserSession(userId, sessionId, request.currentUser!);
  }

  @Post(':id/sessions/revoke')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersResetPassword)
  revokeAllUserSessions(@Param('id') userId: string, @Req() request: AuthenticatedRequest) {
    return this.usersService.revokeAllUserSessions(userId, request.currentUser!);
  }

  @Post(':id/unlock')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersResetPassword)
  unlockUser(@Param('id') userId: string, @Req() request: AuthenticatedRequest) {
    return this.usersService.unlockUser(userId, request.currentUser!);
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

  @Post(':id/temporary-password')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersResetPassword)
  issueTemporaryPassword(@Param('id') userId: string, @Req() request: AuthenticatedRequest) {
    return this.usersService.issueTemporaryPassword(userId, request.currentUser!);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(...rolePolicies.usersDeactivate)
  updateUserStatus(@Param('id') userId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = updateUserStatusSchema.parse(body);

    return this.usersService.updateUserStatus(userId, request.currentUser!, input.status, input.confirm === true);
  }
}
