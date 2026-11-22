import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { isTelegramConfigured, isTelegramWebhookAuthentic, telegramBotLink, telegramGateway, TelegramSendError } from './telegram.js';

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
  jest.restoreAllMocks();
});

describe('telegram channel', () => {
  it('is configured only when the token and the bot name are both set', () => {
    delete process.env['TELEGRAM_BOT_TOKEN'];
    delete process.env['TELEGRAM_BOT_USERNAME'];
    expect(isTelegramConfigured()).toBe(false);
    process.env['TELEGRAM_BOT_TOKEN'] = 'token';
    expect(isTelegramConfigured()).toBe(false);
    process.env['TELEGRAM_BOT_USERNAME'] = '@my_bot';
    expect(isTelegramConfigured()).toBe(true);
    expect(telegramBotLink('abc')).toBe('https://t.me/my_bot?start=abc');
  });

  it('accepts the webhook only with the exact secret', () => {
    delete process.env['TELEGRAM_WEBHOOK_SECRET'];
    expect(isTelegramWebhookAuthentic('anything')).toBe(false);
    process.env['TELEGRAM_WEBHOOK_SECRET'] = 'right-secret';
    expect(isTelegramWebhookAuthentic('right-secret')).toBe(true);
    expect(isTelegramWebhookAuthentic('wrong-secret')).toBe(false);
    expect(isTelegramWebhookAuthentic(undefined)).toBe(false);
  });

  it('maps Bot API answers to short codes without the token, chat or text', async () => {
    process.env['TELEGRAM_BOT_TOKEN'] = 'secret-token';
    const answer = (status: number) => jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status }));
    answer(403);
    await expect(telegramGateway.send('1', 'text')).rejects.toMatchObject({ code: 'blocked' });
    answer(429);
    await expect(telegramGateway.send('1', 'text')).rejects.toMatchObject({ code: 'rate_limited' });
    answer(400);
    await expect(telegramGateway.send('1', 'text')).rejects.toMatchObject({ code: 'chat_not_found' });
    answer(500);
    await expect(telegramGateway.send('1', 'text')).rejects.toMatchObject({ code: 'rejected' });
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom secret-token'));
    const error = await telegramGateway.send('1', 'secret text').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TelegramSendError);
    expect(String((error as Error).message)).not.toMatch(/secret/);
    answer(200);
    await expect(telegramGateway.send('1', 'text')).resolves.toBeUndefined();
  });
});
