import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';

import { isMailConfigured, sendMail } from '../../common/mail/mailer.js';
import { ResendHttpError } from '../../common/mail/resend.js';
import { SmtpRejectedError } from '../../common/mail/smtp.js';
import { checklistSessionReminderDeliveryErrors } from '../../common/observability/metrics.js';

import { CHECKLIST_SESSION_CHANGE_TYPES, type ChecklistSessionChangeType } from './checklist-session-notifications.js';
import { sessionChangeText } from './checklist-session-notification-text.js';

export type ChecklistSessionReminderMessage = {
  organizationId: string;
  sessionId: string;
  observerId: string;
  reminderType: 'pre_start' | 'incomplete_after_start';
};

export type ChecklistSessionParticipantMessage = {
  organizationId: string;
  sessionId: string;
  recipientId: string;
  checklistTitle: string;
  message: string;
};

type DeliveryFailureReason = 'http_error' | 'timeout' | 'network_error';

/** Thrown for a non-2xx delivery provider response; distinguishes it from network/timeout failures without inspecting error messages that could contain the endpoint URL. */
class ChecklistSessionReminderDeliveryHttpError extends Error {
  constructor(readonly status: number) {
    super(`Checklist session reminder delivery provider returned status ${status}`);
    this.name = 'ChecklistSessionReminderDeliveryHttpError';
  }
}

function classifyDeliveryFailure(error: unknown): DeliveryFailureReason {
  if (error instanceof ChecklistSessionReminderDeliveryHttpError || error instanceof ResendHttpError || error instanceof SmtpRejectedError) return 'http_error';
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout';
  return 'network_error';
}

/**
 * Best-effort mail for reminders, participant messages and session changes. Reuses the common
 * Resend/SMTP capability, with the existing HTTPS delivery hook as a fallback. An unconfigured
 * adapter is a no-op; the transactional in-app Notification remains the source of truth.
 */
@Injectable()
export class ChecklistSessionReminderDelivery {
  private readonly logger = new Logger(ChecklistSessionReminderDelivery.name);

  constructor(private readonly prisma: PrismaService) {}

  checkReadiness(): 'ok' | 'disabled' {
    return isMailConfigured() || process.env['CHECKLIST_SESSION_REMINDER_DELIVERY_URL'] ? 'ok' : 'disabled';
  }

  async send(message: ChecklistSessionReminderMessage): Promise<void> {
    if (this.checkReadiness() === 'disabled') return;
    const current = await this.prisma.checklistSession.findFirst({
      where: { id: message.sessionId, organizationId: message.organizationId, observerId: message.observerId, deletedAt: null, status: { in: ['scheduled', 'in_progress', 'paused'] } },
      select: { id: true },
    });
    if (!current) return;
    if (isMailConfigured()) {
      const session = await this.prisma.checklistSession.findFirst({
        where: { id: message.sessionId, organizationId: message.organizationId },
        select: { scheduledAt: true, instance: { select: { checklist: { select: { title: true } }, user: { select: { firstName: true, lastName: true } } } } },
      });
      const title = session?.instance.checklist.title ?? 'чек-лист';
      const learner = session ? `${session.instance.user.firstName} ${session.instance.user.lastName}`.trim() : '';
      const when = session?.scheduledAt ? ` Начало: ${session.scheduledAt.toISOString().replace('T', ' ').slice(0, 16)} UTC.` : '';
      const text =
        message.reminderType === 'pre_start'
          ? `Скоро сессия наблюдения «${title}»${learner ? ` (${learner})` : ''}.${when}`
          : `Сессия наблюдения «${title}»${learner ? ` (${learner})` : ''} начата, но не завершена.`;
      await this.email(message.observerId, message.organizationId, 'Напоминание о сессии наблюдения', text);
      return;
    }
    await this.post({ ...message }, 'reminder');
  }

  /** PR 333: same endpoint, distinguished by `kind`; the in-app Notification is already durable. */
  async sendMessage(message: ChecklistSessionParticipantMessage): Promise<void> {
    if (this.checkReadiness() === 'disabled') return;
    const current = await this.prisma.checklistSession.findFirst({
      where: { id: message.sessionId, organizationId: message.organizationId, deletedAt: null, instance: { userId: message.recipientId, organizationId: message.organizationId } }, select: { id: true },
    });
    if (!current) return;
    if (isMailConfigured()) {
      await this.email(message.recipientId, message.organizationId, `Сообщение по сессии «${message.checklistTitle}»`, message.message);
      return;
    }
    await this.post({ kind: 'participant_message', ...message }, 'participant message');
  }

  /** PR 345: queued changes are rechecked at delivery, so deleting a session suppresses stale mail. */
  async sendChange(message: { organizationId: string; notificationId: string }): Promise<void> {
    if (this.checkReadiness() === 'disabled') return;
    const notification = await this.prisma.notification.findFirst({
      where: { id: message.notificationId, organizationId: message.organizationId, type: { in: [...CHECKLIST_SESSION_CHANGE_TYPES] } },
      select: { type: true, userId: true, data: true, link: true },
    });
    if (!notification || !CHECKLIST_SESSION_CHANGE_TYPES.includes(notification.type as ChecklistSessionChangeType)) return;
    const data = notification.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data['sessionId'] !== 'string') return;
    const type = notification.type as ChecklistSessionChangeType;
    const session = await this.prisma.checklistSession.findFirst({
      where: { id: data['sessionId'], organizationId: message.organizationId,
        deletedAt: type === 'checklist_session_deleted' ? { not: null } : null,
        instance: { organizationId: message.organizationId } },
      select: { id: true },
    });
    if (!session) return;
    const recipient = await this.prisma.user.findFirst({
      where: { id: notification.userId, organizationId: message.organizationId, deletedAt: null, status: 'active' }, select: { locale: true },
    });
    if (!recipient) return;
    // Only server-authored relative session links are allowed in email, never job-supplied URLs.
    const link = notification.link;
    if (!link || !/^\/(?:learn\/checklists|instructor\/checklists\/sessions)(?:[/?][^\s]*)?$/.test(link)) return;
    if (isMailConfigured()) {
      const text = sessionChangeText(type, recipient.locale);
      const frontend = (process.env['FRONTEND_URL'] ?? '').replace(/\/+$/, '');
      await this.email(notification.userId, message.organizationId, text.title, `${text.message}\n${frontend}${link}`);
      return;
    }
    await this.post({ kind: 'session_change', organizationId: message.organizationId, sessionId: session.id,
      recipientId: notification.userId, type, link, locale: recipient.locale }, 'session change');
  }

  /** Resolves the recipient inside the organization; a user without an address is skipped, never a failure. */
  private async email(userId: string, organizationId: string, subject: string, text: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId, deletedAt: null, status: 'active' }, select: { email: true } });
    if (!user?.email) return;
    try {
      await sendMail({ to: user.email, subject, text });
    } catch (error) {
      const reason = classifyDeliveryFailure(error);
      checklistSessionReminderDeliveryErrors.inc({ reason });
      this.logger.warn(`Checklist session email delivery failed (${reason})`);
      throw error;
    }
  }

  private async post(body: Record<string, unknown>, label: string): Promise<void> {
    const endpoint = process.env['CHECKLIST_SESSION_REMINDER_DELIVERY_URL'];
    if (!endpoint) {
      this.logger.debug(`Checklist session ${label} due but CHECKLIST_SESSION_REMINDER_DELIVERY_URL is not configured`);
      return;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env['CHECKLIST_SESSION_REMINDER_DELIVERY_TOKEN']
            ? { authorization: `Bearer ${process.env['CHECKLIST_SESSION_REMINDER_DELIVERY_TOKEN']}` }
            : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) throw new ChecklistSessionReminderDeliveryHttpError(response.status);
    } catch (error) {
      // Never log error.message or the endpoint: fetch/TypeError messages can embed the URL.
      const reason = classifyDeliveryFailure(error);
      checklistSessionReminderDeliveryErrors.inc({ reason });
      this.logger.warn(`Checklist session ${label} delivery failed (${reason})`);
      throw error;
    }
  }
}
