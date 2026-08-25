import { describe, expect, it } from 'vitest';

import { formatNullableDate } from './formatDate.js';

describe('formatNullableDate', () => {
  it('returns fallback for null', () => {
    expect(formatNullableDate(null, '—')).toBe('—');
  });

  it('returns fallback for empty string', () => {
    expect(formatNullableDate('', '—')).toBe('—');
  });

  it('formats a valid ISO date string', () => {
    expect(formatNullableDate('2026-01-15T10:00:00.000Z', '—', 'en-US', { dateStyle: 'long' }))
      .toBe('January 15, 2026');
    expect(formatNullableDate('2026-01-15T10:00:00.000Z', '—', 'zh-CN', { dateStyle: 'long' }))
      .toBe('2026年1月15日');
  });
});
