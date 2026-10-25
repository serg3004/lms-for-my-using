import { createTransport } from 'nodemailer';

import type { ResendEmail } from './resend.js';

/** The SMTP server answered but refused the login, sender or recipient; only the code is kept (messages can embed addresses). */
export class SmtpRejectedError extends Error {
  constructor(readonly code: string) {
    super(`SMTP server rejected the message (${code})`);
    this.name = 'SmtpRejectedError';
  }
}

/** SMTP (a plain mailbox such as Yandex or Gmail with an app password) is used when host, user and password are set. */
export function isSmtpConfigured(): boolean {
  return Boolean(process.env['SMTP_HOST'] && process.env['SMTP_USER'] && process.env['SMTP_PASS']);
}

export async function sendSmtpEmail(email: ResendEmail): Promise<void> {
  const port = Number(process.env['SMTP_PORT'] ?? 465);
  const transport = createTransport({
    host: process.env['SMTP_HOST'],
    port,
    secure: port === 465,
    auth: { user: process.env['SMTP_USER'], pass: process.env['SMTP_PASS'] },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  try {
    await transport.sendMail({ from: process.env['MAIL_FROM'] ?? process.env['SMTP_USER'], to: email.to, subject: email.subject, text: email.text });
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'UNKNOWN';
    if (code === 'ETIMEDOUT' || (code === 'ESOCKET' && /timeout/i.test(String((error as Error).message)))) {
      throw new DOMException('SMTP timeout', 'TimeoutError');
    }
    if (code === 'EAUTH' || code === 'EENVELOPE' || code === 'EMESSAGE') throw new SmtpRejectedError(code);
    throw error;
  } finally {
    transport.close();
  }
}
