import { jest } from '@jest/globals';

import { BrevoHttpError, isBrevoConfigured, parseSender, sendBrevoEmail } from './brevo.js';

describe('Brevo mailer', () => {
  const originalEnv = process.env;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['BREVO_API_KEY'];
    delete process.env['MAIL_FROM'];
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  });

  it('is configured only when both the key and the sender are set', () => {
    expect(isBrevoConfigured()).toBe(false);
    process.env['BREVO_API_KEY'] = 'xkeysib-1';
    expect(isBrevoConfigured()).toBe(false);
    process.env['MAIL_FROM'] = 'LMS <sender@example.com>';
    expect(isBrevoConfigured()).toBe(true);
  });

  it('parses a sender with and without a display name', () => {
    expect(parseSender('LMS <sender@example.com>')).toEqual({ name: 'LMS', email: 'sender@example.com' });
    expect(parseSender('"LMS Portal" <sender@example.com>')).toEqual({ name: 'LMS Portal', email: 'sender@example.com' });
    expect(parseSender('sender@example.com')).toEqual({ email: 'sender@example.com' });
    expect(parseSender('<sender@example.com>')).toEqual({ email: 'sender@example.com' });
  });

  it('posts the message to the Brevo API with the api-key header', async () => {
    process.env['BREVO_API_KEY'] = 'xkeysib-1';
    process.env['MAIL_FROM'] = 'LMS <sender@example.com>';
    const fetchMock = jest.fn(async () => new Response('{}', { status: 201 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await sendBrevoEmail({ to: 'a@example.com', subject: 'Тема', text: 'Текст' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init.headers as Record<string, string>)['api-key']).toBe('xkeysib-1');
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { name: 'LMS', email: 'sender@example.com' },
      to: [{ email: 'a@example.com' }],
      subject: 'Тема',
      textContent: 'Текст',
    });
  });

  it('throws an error carrying only the status for a non-2xx response', async () => {
    process.env['BREVO_API_KEY'] = 'xkeysib-1';
    process.env['MAIL_FROM'] = 'LMS <sender@example.com>';
    globalThis.fetch = jest.fn(async () => new Response('{"message":"a@example.com"}', { status: 401 })) as unknown as typeof fetch;

    const error = await sendBrevoEmail({ to: 'a@example.com', subject: 's', text: 't' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BrevoHttpError);
    expect((error as BrevoHttpError).status).toBe(401);
    expect((error as BrevoHttpError).message).not.toContain('a@example.com');
  });
});
