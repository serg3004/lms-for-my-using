import { describe, expect, it } from 'vitest';

import { identityResources } from './identityResources.js';

function keys(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, entry]) => (typeof entry === 'object' && entry !== null ? keys(entry as Record<string, unknown>, `${prefix}${key}.`) : [`${prefix}${key}`]));
}

describe('activation without email texts (PR 501)', () => {
  it('has the same keys in every language and no empty text', () => {
    const english = keys(identityResources.en).sort();
    for (const locale of ['ru', 'kk', 'zh'] as const) expect(keys(identityResources[locale]).sort()).toEqual(english);
    for (const locale of ['en', 'ru', 'kk', 'zh'] as const) expect(JSON.stringify(identityResources[locale])).not.toContain('""');
  });
});
