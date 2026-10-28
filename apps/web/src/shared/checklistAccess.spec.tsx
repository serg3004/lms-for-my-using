import { describe, expect, it } from 'vitest';

import { renderToStaticMarkup } from 'react-dom/server';

import { ChecklistAccessBadge, checklistAccessKind } from './checklistAccess.js';

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

describe('ChecklistAccessBadge', () => {
  const t = ((_key: string, fallback: string) => fallback) as never;
  const style = (checklist: { accessMode?: 'assigned' | 'free'; pinned?: boolean }) => renderToStaticMarkup(<ChecklistAccessBadge checklist={checklist} t={t} />);

  it('uses a different tone for each of the three states', () => {
    const tones = [
      style({ accessMode: 'assigned' }),
      style({ accessMode: 'free', pinned: false }),
      style({ accessMode: 'free', pinned: true }),
    ].map((html) => /color:(#[0-9a-f]{6});background:(#[0-9a-f]{6})/.exec(html)?.slice(1).join('/'));
    expect(new Set(tones).size).toBe(3);
  });
});
