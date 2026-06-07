import { describe, expect, it } from 'vitest';

import kkCommon from './locales/kk/common.json';
import ruCommon from './locales/ru/common.json';

type JsonObject = Record<string, unknown>;

function flattenKeys(obj: JsonObject, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return flattenKeys(value as JsonObject, fullKey);
    }

    return [fullKey];
  });
}

function missingKeys(source: JsonObject, target: JsonObject): string[] {
  const sourceKeys = new Set(flattenKeys(source));
  const targetKeys = new Set(flattenKeys(target));

  return [...sourceKeys].filter((key) => !targetKeys.has(key));
}

describe('Locale sync: kk must contain all keys from ru', () => {
  it('has no missing keys in kk relative to ru', () => {
    const missing = missingKeys(ruCommon, kkCommon);

    expect(missing, `Missing keys in kk:\n${missing.map((k) => `  - ${k}`).join('\n')}`).toHaveLength(0);
  });
});
