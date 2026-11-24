import { describe, expect, it } from 'vitest';

import { DEFAULT_WIDGETS, figureChange, moveWidget, resizeWidget, resolveWidgets, toggleWidget } from './SheetAnalyticsLayout.js';

const ids = (list: readonly { id: string }[]) => list.map((widget) => widget.id);

describe('analytics dashboard layout (PR 520)', () => {
  it('falls back from the user layout to the organization default to the built-in set', () => {
    const own = { version: 1 as const, widgets: [{ id: 'donut' as const, size: 'S' as const }] };
    const org = { version: 1 as const, widgets: [{ id: 'heat' as const, size: 'L' as const }] };
    expect(resolveWidgets({ user: own, organization: org })).toEqual(own.widgets);
    expect(resolveWidgets({ user: null, organization: org })).toEqual(org.widgets);
    expect(resolveWidgets({ user: null, organization: null })).toEqual(DEFAULT_WIDGETS);
    expect(resolveWidgets(null)).toEqual(DEFAULT_WIDGETS);
    // an empty own dashboard is a choice, not "nothing saved"
    expect(resolveWidgets({ user: { version: 1, widgets: [] }, organization: org })).toEqual([]);
  });

  it('adds a card at the end with its natural size and removes it again', () => {
    const added = toggleWidget([{ id: 'trend', size: 'M' }], 'kpi');
    expect(added).toEqual([{ id: 'trend', size: 'M' }, { id: 'kpi', size: 'L' }]);
    expect(toggleWidget(added, 'kpi')).toEqual([{ id: 'trend', size: 'M' }]);
  });

  it('changes the size of one card only', () => {
    expect(resizeWidget([{ id: 'trend', size: 'M' }, { id: 'heat', size: 'M' }], 'heat', 'S')).toEqual([{ id: 'trend', size: 'M' }, { id: 'heat', size: 'S' }]);
  });

  it('moves a card to another place and ignores impossible moves', () => {
    const list = DEFAULT_WIDGETS.slice(0, 4);
    expect(ids(moveWidget(list, 0, 2))).toEqual(['trend', 'levels', 'kpi', 'donut']);
    expect(ids(moveWidget(list, 3, 0))).toEqual(['donut', 'kpi', 'trend', 'levels']);
    expect(ids(moveWidget(list, 1, 1))).toEqual(ids(list));
    expect(ids(moveWidget(list, 0, 9))).toEqual(ids(list));
    expect(list).toHaveLength(4);
  });

  it('tells whether a change is good news, depending on the figure', () => {
    expect(figureChange(80, 70, true)).toEqual({ delta: 10, good: true });
    expect(figureChange(3, 5, false)).toEqual({ delta: -2, good: true });
    expect(figureChange(7, 5, false)).toEqual({ delta: 2, good: false });
    expect(figureChange(null, 5, true)).toBeNull();
    expect(figureChange(5, null, true)).toBeNull();
  });
});
