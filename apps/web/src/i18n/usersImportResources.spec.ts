import { describe, expect, it } from 'vitest';

import { usersImportResources } from './usersImportResources.js';

function keys(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, entry]) => (typeof entry === 'object' && entry !== null ? keys(entry as Record<string, unknown>, `${prefix}${key}.`) : [`${prefix}${key}`]));
}

describe('user import texts (PR 492)', () => {
  it('has the same keys in every language', () => {
    const english = keys(usersImportResources.en).sort();
    for (const locale of ['ru', 'kk', 'zh'] as const) expect(keys(usersImportResources[locale]).sort()).toEqual(english);
  });

  it('names every column in every language, so a template header is recognized back', () => {
    for (const locale of ['en', 'ru', 'kk', 'zh'] as const) {
      const names = Object.values(usersImportResources[locale].columns);
      expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(names.length);
    }
  });
});
