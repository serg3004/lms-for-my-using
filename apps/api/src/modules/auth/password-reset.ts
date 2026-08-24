import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

import { passwordResetDeliveryErrors } from '../../common/observability/metrics.js';

export const passwordResetLifetimeMs = 60 * 60 * 1000;

export function createPasswordResetToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashPasswordResetToken(token) };
}

export function hashPasswordResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export type PasswordResetMessage = {
  email: string;
  organizationId: string;
  token: string;
  expiresAt: Date;
};

type DeliveryFailureReason = 'http_error' | 'timeout' | 'network_error';

/** Thrown for a non-2xx delivery provider response; distinguishes it from network/timeout failures without inspecting error messages that could contain the endpoint URL. */
class PasswordResetDeliveryHttpError extends Error {
  constructor(readonly status: number) {
    super(`Password reset delivery provider returned status ${status}`);
    this.name = 'PasswordResetDeliveryHttpError';
  }
}

function classifyDeliveryFailure(error: unknown): DeliveryFailureReason {
  if (error instanceof PasswordResetDeliveryHttpError) return 'http_error';
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout';
  return 'network_error';
}

/** Provider-neutral delivery adapter. The configured HTTPS endpoint owns email delivery. */
@Injectable()
export class PasswordResetDelivery {
  private readonly logger = new Logger(PasswordResetDelivery.name);

  /**
   * Application readiness never depends on this — an unconfigured delivery provider is a
   * valid, documented operational mode (see docs/PASSWORD_RESET_STATUS.md), not a failure.
   * Exposed so callers (health/ops tooling) can distinguish "not configured" from "configured
   * but failing" without duplicating the env var check.
   */
  checkReadiness(): 'ok' | 'disabled' {
    return process.env['PASSWORD_RESET_DELIVERY_URL'] ? 'ok' : 'disabled';
  }

  async send(message: PasswordResetMessage): Promise<void> {
    const endpoint = process.env['PASSWORD_RESET_DELIVERY_URL'];
    if (!endpoint) {
      this.logger.warn('Password reset requested but PASSWORD_RESET_DELIVERY_URL is not configured');
      return;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env['PASSWORD_RESET_DELIVERY_TOKEN']
            ? { authorization: `Bearer ${process.env['PASSWORD_RESET_DELIVERY_TOKEN']}` }
            : {}),
        },
        body: JSON.stringify({ ...message, expiresAt: message.expiresAt.toISOString() }),
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) throw new PasswordResetDeliveryHttpError(response.status);
    } catch (error) {
      // Never log error.message or the endpoint: fetch/TypeError messages can embed the URL.
      const reason = classifyDeliveryFailure(error);
      passwordResetDeliveryErrors.inc({ reason });
      this.logger.warn(`Password reset delivery failed (${reason})`);
      throw error;
    }
  }
}
