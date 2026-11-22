import { randomUUID } from 'node:crypto';

/**
 * PR 501: a person without a mailbox still needs a unique address-shaped value (the column is required and part of the
 * sign-in claims). It uses the reserved `.invalid` top-level domain, so nothing can ever be delivered to it; mail code
 * skips such addresses and the interface shows "no email".
 */
export const NO_EMAIL_DOMAIN = 'no-email.invalid';

export function noEmailAddress(): string {
  return `${randomUUID()}@${NO_EMAIL_DOMAIN}`;
}

export function hasNoEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${NO_EMAIL_DOMAIN}`);
}
