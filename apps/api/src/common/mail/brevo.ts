import type { ResendEmail } from './resend.js';

/** Thrown for a non-2xx Brevo response; the status is the only detail kept (messages can embed addresses). */
export class BrevoHttpError extends Error {
  constructor(readonly status: number) {
    super(`Brevo returned status ${status}`);
    this.name = 'BrevoHttpError';
  }
}

/** Brevo (HTTPS API, works where outbound SMTP is blocked) is used when the key and a verified sender are set. */
export function isBrevoConfigured(): boolean {
  return Boolean(process.env['BREVO_API_KEY'] && process.env['MAIL_FROM']);
}

/** Splits `Name <address>` or a bare address into the Brevo sender object. */
export function parseSender(value: string): { name?: string; email: string } {
  const match = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(value);
  if (!match) return { email: value.trim() };
  const name = match[1]?.replace(/^"|"$/g, '').trim();
  return name ? { name, email: match[2]!.trim() } : { email: match[2]!.trim() };
}

export async function sendBrevoEmail(email: ResendEmail): Promise<void> {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'api-key': process.env['BREVO_API_KEY'] ?? '',
    },
    body: JSON.stringify({
      sender: parseSender(process.env['MAIL_FROM'] ?? ''),
      to: [{ email: email.to }],
      subject: email.subject,
      textContent: email.text,
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new BrevoHttpError(response.status);
}
