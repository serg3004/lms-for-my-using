export type ResendEmail = { to: string; subject: string; text: string };

/** Thrown for a non-2xx Resend response; the status is the only detail kept (messages can embed addresses). */
export class ResendHttpError extends Error {
  constructor(readonly status: number) {
    super(`Resend returned status ${status}`);
    this.name = 'ResendHttpError';
  }
}

/** Resend is used only when both the key and a verified sender address are configured. */
export function isResendConfigured(): boolean {
  return Boolean(process.env['RESEND_API_KEY'] && process.env['MAIL_FROM']);
}

export async function sendResendEmail(email: ResendEmail): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env['RESEND_API_KEY']}`,
    },
    body: JSON.stringify({ from: process.env['MAIL_FROM'], to: [email.to], subject: email.subject, text: email.text }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new ResendHttpError(response.status);
}
