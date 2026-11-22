import { describe, expect, it } from '@jest/globals';

import { messageTexts, resolveMessageLocale } from './telegram-messages.js';

const locales = ['ru', 'en', 'kk', 'zh'] as const;

describe('telegram messages', () => {
  it('falls back to Russian for an unknown language', () => {
    expect(resolveMessageLocale('de')).toBe('ru');
    expect(resolveMessageLocale(null)).toBe('ru');
    expect(resolveMessageLocale('kk-KZ')).toBe('kk');
  });

  it.each(locales)('has every text in %s, and the secret only where it belongs', (locale) => {
    const texts = messageTexts(locale);
    const invitation = texts.invitation({ firstName: 'Айгуль', organizationName: 'Орг', link: 'https://x.test/invitation?token=T', days: 7 });
    const activation = texts.activation({ firstName: 'Айгуль', organizationName: 'Орг', link: 'https://x.test/activate', organization: 'org-slug' });
    const password = texts.temporaryPassword({ firstName: 'Айгуль', organizationName: 'Орг', link: 'https://x.test/login', password: 'PW-123', days: 7 });
    expect(invitation).toContain('https://x.test/invitation?token=T');
    expect(activation).toContain('org-slug');
    expect(activation).not.toContain('token=');
    expect(password).toContain('PW-123');
    expect(invitation + activation).not.toContain('PW-123');
    expect(texts.bound('Айгуль')).toContain('Айгуль');
    expect(texts.invalidLink.length).toBeGreaterThan(10);
  });
});
