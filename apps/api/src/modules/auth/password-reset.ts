import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

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

/** Provider-neutral delivery adapter. The configured HTTPS endpoint owns email delivery. */
@Injectable()
export class PasswordResetDelivery {
  private readonly logger = new Logger(PasswordResetDelivery.name);

  async send(message: PasswordResetMessage) {
    const endpoint = process.env['PASSWORD_RESET_DELIVERY_URL'];
    if (!endpoint) {
      this.logger.warn('Password reset requested but PASSWORD_RESET_DELIVERY_URL is not configured');
      return;
    }

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

    if (!response.ok) throw new Error(`Password reset delivery failed with status ${response.status}`);
  }
}
