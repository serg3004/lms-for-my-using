import i18next from 'i18next';
import { describe, expect, it } from 'vitest';

import enCommon from './locales/en/common.json';
import kkCommon from './locales/kk/common.json';
import ruCommon from './locales/ru/common.json';
import zhCommon from './locales/zh/common.json';

type JsonObject = Record<string, unknown>;

function flattenKeys(object: JsonObject, prefix = ''): string[] {
  return Object.entries(object).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return flattenKeys(value as JsonObject, fullKey);
    }

    return [fullKey];
  });
}

function keyDiff(canonical: JsonObject, locale: JsonObject) {
  const canonicalKeys = new Set(flattenKeys(canonical));
  const localeKeys = new Set(flattenKeys(locale));

  return {
    missing: [...canonicalKeys].filter((key) => !localeKeys.has(key)).sort(),
    extra: [...localeKeys].filter((key) => !canonicalKeys.has(key)).sort(),
  };
}

function formatDiff(locale: string, diff: ReturnType<typeof keyDiff>): string {
  const formatKeys = (heading: string, keys: string[]) =>
    keys.length > 0 ? `${heading}:\n${keys.map((key) => `  - ${key}`).join('\n')}` : `${heading}: none`;

  return [`Locale ${locale} differs from canonical locale ru`, formatKeys('Missing keys', diff.missing), formatKeys('Extra keys', diff.extra)].join('\n');
}

const translatedLocales = { en: enCommon, kk: kkCommon, zh: zhCommon } as const;

describe('locale key parity', () => {
  it.each(Object.entries(translatedLocales))('%s has exactly the canonical ru keys', (locale, resources) => {
    const diff = keyDiff(ruCommon, resources);

    expect(diff, formatDiff(locale, diff)).toEqual({ missing: [], extra: [] });
  });

  it('detects missing, extra, and nested keys', () => {
    const diff = keyDiff({ page: { title: 'Title', action: { save: 'Save' } } }, { page: { title: 'Title', extra: 'Extra' } });

    expect(diff).toEqual({ missing: ['page.action.save'], extra: ['page.extra'] });
    expect(formatDiff('test', diff)).toContain('  - page.action.save');
  });

  it('falls back to ru at runtime when a key is absent from the active locale', async () => {
    const instance = i18next.createInstance();
    await instance.init({
      lng: 'en',
      fallbackLng: 'ru',
      resources: {
        en: { translation: {} },
        ru: { translation: { nested: { fallbackMessage: 'Сообщение по умолчанию' } } },
      },
    });

    expect(instance.t('nested.fallbackMessage')).toBe('Сообщение по умолчанию');
  });
});
