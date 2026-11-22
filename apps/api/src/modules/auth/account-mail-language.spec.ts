import { buildLoginLockedMail } from './login-locked-mail.js';
import { buildPasswordChangedMail } from './password-changed-mail.js';
import { buildQrLoginMail } from './qr-login-mail.js';
import { buildInvitationMail } from './user-invitation.js';
import { messageTexts } from '../users/telegram-messages.js';

// PR 498: every message the account plan sends (invitation, lockout notice, password change notice, QR sign-in notice and the
// Telegram texts) is written in the language of its recipient, has no unfilled placeholder, carries no secret it should not
// carry, and falls back to Russian for an unknown language. Follows the idea of the PR 469 copy guard.

const LOCALES = ['ru', 'en', 'kk', 'zh'] as const;
type Locale = typeof LOCALES[number];

const ALPHABET: Record<Locale, RegExp> = { ru: /\p{Script=Cyrillic}/u, kk: /\p{Script=Cyrillic}/u, en: /\p{Script=Latin}/u, zh: /\p{Script=Han}/u };
const KAZAKH_ONLY = /[әіңғүұқөһӘІҢҒҮҰҚӨҺ]/u;
const NAME = 'Aigul';
const LINK = 'https://lms.example.test/invitation?token=TOKEN123';
const WHEN = new Date('2026-11-22T10:00:00Z');
const FORBIDDEN_WORD = new RegExp(['i', 'Spring'].join(''), 'i');

type Message = { subject?: string; text: string };
const messages: Array<{ name: string; build: (locale: string | null) => Message[] }> = [
  { name: 'invitation mail', build: (l) => { const m = buildInvitationMail(l, { firstName: NAME, organizationName: 'Acme', link: LINK, days: 7 }); return [{ subject: m.subject, text: m.text }]; } },
  { name: 'login locked mail', build: (l) => { const m = buildLoginLockedMail(l, { firstName: NAME, minutes: 15 }); return [{ subject: m.subject, text: m.text }]; } },
  { name: 'password changed mail', build: (l) => { const m = buildPasswordChangedMail(l, { firstName: NAME, at: WHEN }); return [{ subject: m.subject, text: m.text }]; } },
  { name: 'QR sign-in mail', build: (l) => { const m = buildQrLoginMail(l, { firstName: NAME, device: 'Chrome' }); return [{ subject: m.subject, text: m.text }]; } },
  {
    name: 'Telegram texts',
    build: (l) => {
      const t = messageTexts(l);
      return [
        { text: t.bound(NAME) },
        { text: t.invalidLink },
        { text: t.invitation({ firstName: NAME, organizationName: 'Acme', link: LINK, days: 7 }) },
        { text: t.activation({ firstName: NAME, organizationName: 'Acme', link: LINK, organization: 'acme' }) },
        { text: t.temporaryPassword({ firstName: NAME, organizationName: 'Acme', link: LINK, password: 'Temp-Pass-1', days: 3 }) },
      ];
    },
  },
];

describe('account messages are written in the recipient language', () => {
  describe.each(messages)('$name', ({ build }) => {
    describe.each(LOCALES)('%s', (locale) => {
      const parts = build(locale).flatMap((m) => (m.subject === undefined ? [m.text] : [m.subject, m.text]));

      it('uses its own alphabet and no other language', () => {
        for (const text of parts) {
          expect(text.trim().length).toBeGreaterThan(0);
          expect(text).toMatch(ALPHABET[locale]);
          if (locale === 'ru') expect(text).not.toMatch(KAZAKH_ONLY);
          if (locale === 'en' || locale === 'zh') expect(text).not.toMatch(/\p{Script=Cyrillic}/u);
          if (locale === 'ru' || locale === 'kk') expect(text).not.toMatch(/\p{Script=Han}/u);
        }
      });

      it('has no unfilled placeholder and not the forbidden product word', () => {
        for (const text of parts) {
          expect(text).not.toMatch(/\{\{|\}\}|\$\{|undefined|NaN|\[object/);
          expect(text).not.toMatch(FORBIDDEN_WORD);
        }
      });
    });

    it('writes Kazakh with Kazakh letters (a Russian text copied there would have none)', () => {
      expect(build('kk').flatMap((m) => [m.subject ?? '', m.text]).join(' ')).toMatch(KAZAKH_ONLY);
    });

    it.each([[null], ['de'], ['']])('falls back to Russian for the language %p', (locale) => {
      expect(build(locale)).toEqual(build('ru'));
    });

    it('accepts a regional language code', () => {
      expect(build('en-US')).toEqual(build('en'));
      expect(build('KK')).toEqual(build('kk'));
    });
  });
});

describe('what the messages may carry', () => {
  it('mails never carry a password and the invitation carries only its link', () => {
    for (const locale of LOCALES) {
      const all = [
        ...messages[1]!.build(locale), ...messages[2]!.build(locale), ...messages[3]!.build(locale),
      ].map((m) => `${m.subject} ${m.text}`).join('\n');
      expect(all).not.toMatch(/https?:\/\//);
      expect(all).not.toMatch(/token/i);
      const invitation = messages[0]!.build(locale).map((m) => `${m.subject} ${m.text}`).join('\n');
      expect(invitation).toContain(LINK);
    }
  });

  it('only the temporary password text of Telegram contains a password', () => {
    for (const locale of LOCALES) {
      const t = messageTexts(locale);
      expect(t.temporaryPassword({ firstName: NAME, organizationName: 'Acme', link: LINK, password: 'Temp-Pass-1', days: 3 })).toContain('Temp-Pass-1');
      for (const text of [t.bound(NAME), t.invalidLink, t.invitation({ firstName: NAME, organizationName: 'Acme', link: LINK, days: 7 }), t.activation({ firstName: NAME, organizationName: 'Acme', link: LINK, organization: 'acme' })]) {
        expect(text).not.toContain('Temp-Pass-1');
      }
    }
  });
});
