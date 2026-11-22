import { describe, expect, it } from 'vitest';

import { userFieldsResources } from './userFieldsResources.js';

function keys(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, entry]) => (typeof entry === 'object' && entry !== null ? keys(entry as Record<string, unknown>, `${prefix}${key}.`) : [`${prefix}${key}`]));
}

describe('user field texts (PR 500)', () => {
  it('has the same keys in every language and no empty text', () => {
    const english = keys(userFieldsResources.en).sort();
    for (const locale of ['ru', 'kk', 'zh'] as const) expect(keys(userFieldsResources[locale]).sort()).toEqual(english);
    for (const locale of ['en', 'ru', 'kk', 'zh'] as const) {
      const flat = JSON.stringify(userFieldsResources[locale]);
      expect(flat).not.toContain('""');
    }
  });
});
