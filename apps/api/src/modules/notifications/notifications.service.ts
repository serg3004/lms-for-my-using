import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';

const notificationSelect = {
  id: true,
  type: true,
  data: true,
  link: true,
  readAt: true,
  createdAt: true,
} as const;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listNotifications(userId: string, organizationId: string, limit = 20, cursor?: string) {
    return this.prisma.notification.findMany({
      where: { userId, organizationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: notificationSelect,
    });
  }

  async countUnread(userId: string, organizationId: string) {
    return this.prisma.notification.count({ where: { userId, organizationId, readAt: null } });
  }

  async markAsRead(notificationId: string, userId: string, organizationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId, organizationId },
      select: { id: true },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
      select: notificationSelect,
    });
  }

  async markAllAsRead(userId: string, organizationId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, organizationId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
