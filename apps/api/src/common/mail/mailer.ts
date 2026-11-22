import { hasNoEmail } from '../no-email.js';
import { isBrevoConfigured, sendBrevoEmail } from './brevo.js';
import { isResendConfigured, sendResendEmail } from './resend.js';
import type { ResendEmail } from './resend.js';
import { isSmtpConfigured, sendSmtpEmail } from './smtp.js';

/** Direct email delivery is on when Resend, Brevo or SMTP is configured; priority is Resend, then Brevo, then SMTP. */
export function isMailConfigured(): boolean {
  return isResendConfigured() || isBrevoConfigured() || isSmtpConfigured();
}

export async function sendMail(email: ResendEmail): Promise<void> {
  // PR 501: a person without a mailbox has a placeholder address; every caller already treats a failed send as "not delivered".
  if (hasNoEmail(email.to)) throw new Error('The recipient has no mailbox');
  if (isResendConfigured()) return sendResendEmail(email);
  if (isBrevoConfigured()) return sendBrevoEmail(email);
  return sendSmtpEmail(email);
}
