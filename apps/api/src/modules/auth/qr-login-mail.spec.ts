import { buildQrLoginMail } from './qr-login-mail.js';

describe('buildQrLoginMail (PR 505)', () => {
  it.each(['ru', 'en', 'kk', 'zh'])('names the device in %s and carries no link, code or password', (locale) => {
    const mail = buildQrLoginMail(locale, { firstName: 'Айгуль', device: 'Chrome · Windows' });
    expect(mail.subject.length).toBeGreaterThan(0);
    expect(mail.text).toContain('Айгуль');
    expect(mail.text).toContain('Chrome · Windows');
    expect(mail.text).not.toMatch(/https?:\/\//);
  });

  it('falls back to Russian for an unknown language', () => {
    expect(buildQrLoginMail('de', { firstName: 'A', device: 'B' }).subject).toBe('Выполнен вход по QR-коду');
  });
});
