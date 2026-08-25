import { describe, expect, it } from 'vitest';

import en from './locales/en/common.json';
import kk from './locales/kk/common.json';
import ru from './locales/ru/common.json';
import zh from './locales/zh/common.json';

function leafKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
}

describe('i18n hardening', () => {
  it('keeps all common locale keys in parity', () => {
    const expected = leafKeys(ru).sort();
    for (const locale of [en, kk, zh]) expect(leafKeys(locale).sort()).toEqual(expected);
  });

  it('has localized navigation and checklist system defaults in every locale', () => {
    for (const locale of [ru, en, kk, zh]) {
      expect(locale.nav.logout.trim()).not.toBe('');
      expect(Object.values(locale.admin.checklists.defaultScale)).toHaveLength(5);
    }
    expect(en.nav.logout).not.toBe(ru.nav.logout);
  });
});
