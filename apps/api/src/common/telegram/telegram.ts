import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * PR 503: the Telegram bot channel. The token, the bot name and the webhook secret live only in the environment.
 * A send never puts the token, the chat or the text into an error: callers get a short machine code.
 */

export type TelegramErrorCode = 'blocked' | 'chat_not_found' | 'rate_limited' | 'network' | 'rejected';

export class TelegramSendError extends Error {
  constructor(readonly code: TelegramErrorCode) {
    super(`Telegram send failed: ${code}`);
  }
}

const token = () => (process.env['TELEGRAM_BOT_TOKEN'] ?? '').trim();
const botUsername = () => (process.env['TELEGRAM_BOT_USERNAME'] ?? '').trim().replace(/^@/, '');

export function isTelegramConfigured(): boolean {
  return Boolean(token() && botUsername());
}

export function getTelegramBotUsername(): string | null {
  return botUsername() || null;
}

/** The link a person opens to press "Start" in the bot; the code binds their chat to their card. */
export function telegramBotLink(code: string): string {
  return `https://t.me/${botUsername()}?start=${code}`;
}

/** Constant-time check of the secret header Telegram sends with every webhook call. */
export function isTelegramWebhookAuthentic(header: string | undefined): boolean {
  const secret = (process.env['TELEGRAM_WEBHOOK_SECRET'] ?? '').trim();
  if (!secret || !header) return false;
  const expected = createHash('sha256').update(secret).digest();
  const given = createHash('sha256').update(header).digest();
  return timingSafeEqual(expected, given);
}

async function call(method: string, payload: Record<string, unknown>): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new TelegramSendError('network');
  }
  if (response.ok) return;
  if (response.status === 403) throw new TelegramSendError('blocked');
  if (response.status === 429) throw new TelegramSendError('rate_limited');
  if (response.status === 400) throw new TelegramSendError('chat_not_found');
  throw new TelegramSendError('rejected');
}

/** Replaced in tests; the real implementation talks to the Bot API. */
export const telegramGateway = {
  send: (chatId: string, text: string): Promise<void> => call('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true }),
  setWebhook: (url: string): Promise<void> => call('setWebhook', {
    url,
    secret_token: (process.env['TELEGRAM_WEBHOOK_SECRET'] ?? '').trim(),
    allowed_updates: ['message'],
  }),
};
