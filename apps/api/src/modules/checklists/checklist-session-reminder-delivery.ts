import { Injectable, Logger } from '@nestjs/common';

import { checklistSessionReminderDeliveryErrors } from '../../common/observability/metrics.js';

export type ChecklistSessionReminderMessage = {
  organizationId: string;
  sessionId: string;
  observerId: string;
  reminderType: 'pre_start' | 'incomplete_after_start';
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
  if (error instanceof ChecklistSessionReminderDeliveryHttpError) return 'http_error';
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

  checkReadiness(): 'ok' | 'disabled' {
    return process.env['CHECKLIST_SESSION_REMINDER_DELIVERY_URL'] ? 'ok' : 'disabled';
  }

  async send(message: ChecklistSessionReminderMessage): Promise<void> {
    const endpoint = process.env['CHECKLIST_SESSION_REMINDER_DELIVERY_URL'];
    if (!endpoint) {
      this.logger.debug('Checklist session reminder due but CHECKLIST_SESSION_REMINDER_DELIVERY_URL is not configured');
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
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) throw new ChecklistSessionReminderDeliveryHttpError(response.status);
    } catch (error) {
      // Never log error.message or the endpoint: fetch/TypeError messages can embed the URL.
      const reason = classifyDeliveryFailure(error);
      checklistSessionReminderDeliveryErrors.inc({ reason });
      this.logger.warn(`Checklist session reminder delivery failed (${reason})`);
      throw error;
    }
  }
}
