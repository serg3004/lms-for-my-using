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
    const result = formatNullableDate('2026-01-15T10:00:00.000Z', '—');
    expect(result).not.toBe('—');
    expect(result).toContain('2026');
  });
});
