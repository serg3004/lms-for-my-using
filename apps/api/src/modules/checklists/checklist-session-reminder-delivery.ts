import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';

import { isResendConfigured, ResendHttpError, sendResendEmail } from '../../common/mail/resend.js';
import { checklistSessionReminderDeliveryErrors } from '../../common/observability/metrics.js';

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
  if (error instanceof ChecklistSessionReminderDeliveryHttpError || error instanceof ResendHttpError) return 'http_error';
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout';
  return 'network_error';
}

/**
 * Provider-neutral delivery adapter for checklist session reminder emails, mirroring
 * `PasswordResetDelivery` (`apps/api/src/modules/auth/password-reset.ts`): the configured HTTPS
 * endpoint owns actual email delivery, and this never invents its own SMTP/provider integration.
 * PR 291's "email только при production capability" criterion: an unconfigured endpoint is a
 * valid, documented no-op, not a failure — the in-app `Notification` row (created before this
 * runs, in the same transaction as the reminder) is the workflow's source of truth regardless of
 * whether email delivery is configured or succeeds.
 */
@Injectable()
export class ChecklistSessionReminderDelivery {
  private readonly logger = new Logger(ChecklistSessionReminderDelivery.name);

  constructor(private readonly prisma: PrismaService) {}

  checkReadiness(): 'ok' | 'disabled' {
    return isResendConfigured() || process.env['CHECKLIST_SESSION_REMINDER_DELIVERY_URL'] ? 'ok' : 'disabled';
  }

  async send(message: ChecklistSessionReminderMessage): Promise<void> {
    if (isResendConfigured()) {
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
    if (isResendConfigured()) {
      await this.email(message.recipientId, message.organizationId, `Сообщение по сессии «${message.checklistTitle}»`, message.message);
      return;
    }
    await this.post({ kind: 'participant_message', ...message }, 'participant message');
  }

  /** Resolves the recipient inside the organization; a user without an address is skipped, never a failure. */
  private async email(userId: string, organizationId: string, subject: string, text: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId }, select: { email: true } });
    if (!user?.email) return;
    try {
      await sendResendEmail({ to: user.email, subject, text });
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
