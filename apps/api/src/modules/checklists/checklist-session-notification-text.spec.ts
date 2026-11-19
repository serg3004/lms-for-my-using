import { readFileSync } from 'node:fs';

import { CHECKLIST_SESSION_CHANGE_TYPES } from './checklist-session-notifications.js';
import { instanceTransferText, observerDeactivatedText, sessionChangeText } from './checklist-session-notification-text.js';

// PR 469: the email copy and the portal copy (`notifications.types` in the web locale files) are
// two sources for the same wording. This guard fails CI when they diverge, when an email is not
// written in its recipient's language, or when the language fallback changes unnoticed.

const LOCALES = ['ru', 'en', 'kk', 'zh'] as const;
type Locale = typeof LOCALES[number];
type Entry = { title: string; message: string };

const ALPHABET: Record<Locale, RegExp> = {
  ru: /\p{Script=Cyrillic}/u,
  kk: /\p{Script=Cyrillic}/u,
  en: /\p{Script=Latin}/u,
  zh: /\p{Script=Han}/u,
};
// Letters that exist only in Kazakh Cyrillic: a Russian text copied into the Kazakh email has none of them.
const KAZAKH_ONLY = /[әіңғүұқөһӘІҢҒҮҰҚӨҺ]/u;

function portalTypes(locale: Locale): Record<string, Entry> {
  const url = new URL(`../../../../web/src/i18n/locales/${locale}/common.json`, import.meta.url);
  const resources = JSON.parse(readFileSync(url, 'utf8')) as { notifications?: { types?: Record<string, Entry> } };
  const types = resources.notifications?.types;
  if (!types) throw new Error(`apps/web common.json (${locale}) has no notifications.types block`);
  return types;
}

const PAIRS: Array<{ key: string; email: (locale: string) => Entry }> = [
  ...CHECKLIST_SESSION_CHANGE_TYPES.map((type) => ({ key: type, email: (locale: string) => sessionChangeText(type, locale) })),
  { key: 'checklist_session_observer_deactivated', email: (locale: string) => observerDeactivatedText(locale) },
  { key: 'checklist_instance_transferred', email: (locale: string) => instanceTransferText(locale) },
];

describe('checklist session email copy', () => {
  describe.each(LOCALES)('%s', (locale) => {
    const portal = portalTypes(locale);

    it.each(PAIRS.map((pair) => [pair.key, pair] as const))('%s matches the portal text', (key, pair) => {
      const email = pair.email(locale);
      const web = portal[key];
      expect(web).toBeDefined();
      // Both sources must stay identical, including {{placeholders}}; the message names the type, locale and both strings.
      expect({ key, locale, title: email.title, message: email.message }).toEqual({ key, locale, title: web!.title, message: web!.message });
    });

    it.each(PAIRS.map((pair) => [pair.key, pair] as const))('%s is written in its own language', (_key, pair) => {
      const { title, message } = pair.email(locale);
      for (const text of [title, message]) {
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text).toMatch(ALPHABET[locale]);
        if (locale === 'ru') expect(text).not.toMatch(KAZAKH_ONLY);
        if (locale === 'en' || locale === 'zh') expect(text).not.toMatch(/\p{Script=Cyrillic}/u);
        if (locale === 'ru' || locale === 'kk') expect(text).not.toMatch(/\p{Script=Han}/u);
      }
      if (locale === 'kk') expect(`${title} ${message}`).toMatch(KAZAKH_ONLY);
    });
  });

  it('keeps the four languages different from one another for every text', () => {
    for (const pair of PAIRS) {
      const messages = LOCALES.map((locale) => pair.email(locale).message);
      expect(new Set(messages).size).toBe(LOCALES.length);
    }
  });

  it('uses the language part of a regional locale such as kk-KZ or zh-CN', () => {
    for (const pair of PAIRS) {
      expect(pair.email('kk-KZ')).toEqual(pair.email('kk'));
      expect(pair.email('zh-CN')).toEqual(pair.email('zh'));
      expect(pair.email('en-GB')).toEqual(pair.email('en'));
    }
  });

  it('falls back to Russian for an unknown language', () => {
    for (const pair of PAIRS) {
      expect(pair.email('fr')).toEqual(pair.email('ru'));
      expect(pair.email('')).toEqual(pair.email('ru'));
    }
  });
});
