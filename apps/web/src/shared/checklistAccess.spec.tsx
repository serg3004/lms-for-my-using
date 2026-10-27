import { describe, expect, it } from 'vitest';

import { checklistAccessKind } from './checklistAccess.js';

// PR 355: the label is computed from the fields, never stored; all three states are distinct.
describe('checklistAccessKind', () => {
  it('maps the three states', () => {
    expect(checklistAccessKind({ accessMode: 'assigned', pinned: false })).toBe('assigned');
    expect(checklistAccessKind({ accessMode: 'free', pinned: false })).toBe('free');
    expect(checklistAccessKind({ accessMode: 'free', pinned: true })).toBe('pinned');
  });

  it('reads an older payload without the fields as assigned, and never shows a pinned assigned checklist as pinned', () => {
    expect(checklistAccessKind({})).toBe('assigned');
    expect(checklistAccessKind({ accessMode: 'assigned', pinned: true })).toBe('assigned');
  });
});
