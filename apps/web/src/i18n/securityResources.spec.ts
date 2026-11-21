import { describe, expect, it } from 'vitest';

import { securityResources } from './securityResources.js';

function keys(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, entry]) => (typeof entry === 'object' && entry !== null ? keys(entry as Record<string, unknown>, `${prefix}${key}.`) : [`${prefix}${key}`]));
}

describe('security texts (PR 488, 489)', () => {
  it('has the same keys in every language', () => {
    const english = keys(securityResources.en).sort();
    for (const locale of ['ru', 'kk', 'zh'] as const) expect(keys(securityResources[locale]).sort()).toEqual(english);
  });
});
