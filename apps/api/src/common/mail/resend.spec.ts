import { jest } from '@jest/globals';

import { isResendConfigured, ResendHttpError, sendResendEmail } from './resend.js';

describe('Resend mailer', () => {
  const originalEnv = process.env;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['RESEND_API_KEY'];
    delete process.env['MAIL_FROM'];
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  });

  it('is configured only when both the key and the sender are set', () => {
    expect(isResendConfigured()).toBe(false);
    process.env['RESEND_API_KEY'] = 're_key';
    expect(isResendConfigured()).toBe(false);
    process.env['MAIL_FROM'] = 'LMS <no-reply@example.com>';
    expect(isResendConfigured()).toBe(true);
  });

  it('posts the message to the Resend API with a bearer key', async () => {
    process.env['RESEND_API_KEY'] = 're_key';
    process.env['MAIL_FROM'] = 'LMS <no-reply@example.com>';
    const fetchMock = jest.fn(async () => new Response('{}', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await sendResendEmail({ to: 'a@example.com', subject: 'Тема', text: 'Текст' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer re_key');
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'LMS <no-reply@example.com>',
      to: ['a@example.com'],
      subject: 'Тема',
      text: 'Текст',
    });
  });

  it('throws a status-only error for a non-2xx response', async () => {
    process.env['RESEND_API_KEY'] = 're_key';
    process.env['MAIL_FROM'] = 'x@example.com';
    globalThis.fetch = (async () => new Response('{"message":"to a@example.com"}', { status: 422 })) as typeof fetch;

    const error = await sendResendEmail({ to: 'a@example.com', subject: 's', text: 't' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ResendHttpError);
    expect((error as Error).message).not.toContain('a@example.com');
  });
});
