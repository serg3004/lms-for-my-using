import { isResendConfigured, sendResendEmail } from './resend.js';
import type { ResendEmail } from './resend.js';
import { isSmtpConfigured, sendSmtpEmail } from './smtp.js';

/** Direct email delivery is on when either Resend or SMTP is configured; Resend wins if both are. */
export function isMailConfigured(): boolean {
  return isResendConfigured() || isSmtpConfigured();
}

export async function sendMail(email: ResendEmail): Promise<void> {
  if (isResendConfigured()) return sendResendEmail(email);
  return sendSmtpEmail(email);
}
