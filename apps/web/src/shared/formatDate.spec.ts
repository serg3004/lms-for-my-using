import { describe, expect, it } from 'vitest';

import { formatDate, formatNullableDate } from './formatDate.js';

// PR 303 (Timezone contract): the same absolute instant must render as the same wall-clock time
// for every viewer of a given ChecklistSession, regardless of the viewer's own browser timezone --
// that's what passing `options.timeZone` (Intl.DateTimeFormatOptions already supports it) buys
// over the previous call sites that implicitly formatted in the browser's local zone.
describe('formatDate with an explicit timeZone (PR 303)', () => {
  const instant = '2026-06-15T14:00:00.000Z';

  it('renders the same UTC instant differently for two different session timezones', () => {
    const newYork = formatDate(instant, 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' });
    const almaty = formatDate(instant, 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Almaty' });
    // EDT (UTC-4) in June -> 10:00 AM; Asia/Almaty (UTC+5, no DST) -> 7:00 PM. Different wall
    // clocks for the same instant is exactly the point -- each is what that session's own
    // declared timezone means, not what the reader's browser happens to be set to.
    expect(newYork).toContain('10:00');
    expect(almaty).toContain('7:00');
    expect(newYork).not.toBe(almaty);
  });

  it('is DST-safe: the same wall-clock offset request resolves correctly on both sides of a DST transition', () => {
    // 2026-03-08 is the US spring-forward date; 2:30 AM local doesn't exist that day, so pick
    // instants clearly before/after the transition (07:00 UTC = 2:00 AM EST pre-transition,
    // 07:00 UTC the following day = 3:00 AM EDT post-transition) and confirm the IANA zone data
    // resolves each to the correct standard/daylight abbreviation rather than a fixed UTC offset.
    const beforeSpringForward = formatDate('2026-03-07T07:00:00.000Z', 'en-US', { timeStyle: 'long', timeZone: 'America/New_York' });
    const afterSpringForward = formatDate('2026-03-09T07:00:00.000Z', 'en-US', { timeStyle: 'long', timeZone: 'America/New_York' });
    expect(beforeSpringForward).toContain('EST');
    expect(afterSpringForward).toContain('EDT');
  });
});

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
