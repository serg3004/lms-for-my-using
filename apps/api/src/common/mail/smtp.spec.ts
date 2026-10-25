import { jest } from '@jest/globals';

const sendMail = jest.fn<(message: unknown) => Promise<unknown>>();
const close = jest.fn();
const createTransport = jest.fn(() => ({ sendMail, close }));
jest.unstable_mockModule('nodemailer', () => ({ createTransport }));

const { isSmtpConfigured, sendSmtpEmail, SmtpRejectedError } = await import('./smtp.js');
const { isMailConfigured, sendMail: sendAny } = await import('./mailer.js');

describe('SMTP mailer', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const key of ['RESEND_API_KEY', 'MAIL_FROM', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS']) delete process.env[key];
    sendMail.mockReset();
    close.mockReset();
    createTransport.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const configure = () => {
    process.env['SMTP_HOST'] = 'smtp.yandex.ru';
    process.env['SMTP_USER'] = 'me@yandex.ru';
    process.env['SMTP_PASS'] = 'app-password';
  };

  it('is configured only when host, user and password are all set', () => {
    expect(isSmtpConfigured()).toBe(false);
    process.env['SMTP_HOST'] = 'smtp.yandex.ru';
    process.env['SMTP_USER'] = 'me@yandex.ru';
    expect(isSmtpConfigured()).toBe(false);
    process.env['SMTP_PASS'] = 'app-password';
    expect(isSmtpConfigured()).toBe(true);
    expect(isMailConfigured()).toBe(true);
  });

  it('sends over TLS on 465 from the mailbox address by default and closes the transport', async () => {
    configure();
    sendMail.mockResolvedValue({});
    await sendSmtpEmail({ to: 'a@example.com', subject: 'Hi', text: 'Body' });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.yandex.ru', port: 465, secure: true, auth: { user: 'me@yandex.ru', pass: 'app-password' } }));
    expect(sendMail).toHaveBeenCalledWith({ from: 'me@yandex.ru', to: 'a@example.com', subject: 'Hi', text: 'Body' });
    expect(close).toHaveBeenCalled();
  });

  it('honours MAIL_FROM and a STARTTLS port', async () => {
    configure();
    process.env['SMTP_PORT'] = '587';
    process.env['MAIL_FROM'] = 'LMS <me@yandex.ru>';
    sendMail.mockResolvedValue({});
    await sendSmtpEmail({ to: 'a@example.com', subject: 'Hi', text: 'Body' });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'LMS <me@yandex.ru>' }));
  });

  it('maps a refused login to SmtpRejectedError without leaking the server message', async () => {
    configure();
    sendMail.mockRejectedValue(Object.assign(new Error('535 bad login for me@yandex.ru'), { code: 'EAUTH' }));
    const failure = await sendSmtpEmail({ to: 'a@example.com', subject: 'Hi', text: 'Body' }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SmtpRejectedError);
    expect((failure as Error).message).not.toContain('yandex');
    expect(close).toHaveBeenCalled();
  });

  it('maps a connection timeout to a TimeoutError', async () => {
    configure();
    sendMail.mockRejectedValue(Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' }));
    const failure = await sendSmtpEmail({ to: 'a@example.com', subject: 'Hi', text: 'Body' }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(DOMException);
    expect((failure as DOMException).name).toBe('TimeoutError');
  });

  it('prefers Resend when both providers are configured', async () => {
    configure();
    process.env['RESEND_API_KEY'] = 're_key';
    process.env['MAIL_FROM'] = 'LMS <no-reply@example.com>';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;
    try {
      await sendAny({ to: 'a@example.com', subject: 'Hi', text: 'Body' });
      expect(globalThis.fetch).toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
