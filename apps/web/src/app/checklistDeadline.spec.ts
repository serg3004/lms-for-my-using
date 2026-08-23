import { describe, expect, it } from 'vitest';

import { getChecklistDeadlineState, localDateTimeToUtcIso } from './checklistDeadline.js';

describe('checklist deadline UI helpers', () => {
  const now = Date.parse('2026-08-23T12:00:00.000Z');

  it('distinguishes open, due-soon, expired, closed, and no-deadline states', () => {
    expect(getChecklistDeadlineState({ status: 'assigned', dueAt: null }, now)).toBe('none');
    expect(getChecklistDeadlineState({ status: 'assigned', dueAt: '2026-08-25T12:00:00.000Z' }, now)).toBe('scheduled');
    expect(getChecklistDeadlineState({ status: 'in_progress', dueAt: '2026-08-23T18:00:00.000Z' }, now)).toBe('due_soon');
    expect(getChecklistDeadlineState({ status: 'expired', dueAt: '2026-08-23T11:00:00.000Z' }, now)).toBe('expired');
    expect(getChecklistDeadlineState({ status: 'submitted', dueAt: '2026-08-23T11:00:00.000Z' }, now)).toBe('closed');
    expect(getChecklistDeadlineState({ status: 'completed', dueAt: '2026-08-23T11:00:00.000Z' }, now)).toBe('closed');
  });

  it('converts a browser-local datetime into an ISO UTC payload', () => {
    const value = '2026-08-23T12:30';
    const iso = localDateTimeToUtcIso(value);
    expect(iso).toBe(new Date(value).toISOString());
  });
});
