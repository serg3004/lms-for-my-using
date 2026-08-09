import { Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';

import { AuthGuard, Roles, RolesGuard, rolePolicies } from '../auth/public.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
@UseGuards(AuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Roles(...rolePolicies.notificationsRead)
  listNotifications(@Req() request: AuthenticatedRequest) {
    return this.notificationsService.listNotifications(request.currentUser!.id, request.currentUser!.organizationId);
  }

  @Get('unread-count')
  @Roles(...rolePolicies.notificationsRead)
  async countUnread(@Req() request: AuthenticatedRequest) {
    const count = await this.notificationsService.countUnread(request.currentUser!.id, request.currentUser!.organizationId);
    return { count };
  }

  @Patch(':id/read')
  @Roles(...rolePolicies.notificationsWrite)
  markAsRead(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.notificationsService.markAsRead(id, request.currentUser!.id, request.currentUser!.organizationId);
  }

  @Patch('read-all')
  @Roles(...rolePolicies.notificationsWrite)
  async markAllAsRead(@Req() request: AuthenticatedRequest) {
    await this.notificationsService.markAllAsRead(request.currentUser!.id, request.currentUser!.organizationId);
    return { ok: true };
  }
}
