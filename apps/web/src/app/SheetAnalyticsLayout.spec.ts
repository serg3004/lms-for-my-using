import { describe, expect, it } from 'vitest';

import type { AnalyticsDashboardSet } from '../shared/api/manager.js';
import {
  addDashboard, currentDashboard, DEFAULT_WIDGETS, defaultSet, figureChange, MAX_DASHBOARDS, moveWidget, optionValue, optionValues, parseSlice, removeDashboard,
  renameDashboard, resizeWidget, resolveDashboards, selectDashboard, setWidgetOption, toggleWidget, withWidgets,
} from './SheetAnalyticsLayout.js';

const ids = (list: readonly { id: string }[]) => list.map((widget) => widget.id);
const set = (id: string, widgets: AnalyticsDashboardSet['dashboards'][number]['widgets'] = []): AnalyticsDashboardSet => ({ version: 2, current: id, dashboards: [{ id, name: 'A', widgets }] });

describe('analytics dashboards (PR 520)', () => {
  it('falls back from the user set to the organization default to the built-in dashboard', () => {
    const own = set('own', [{ id: 'donut', size: 'S' }]);
    const org = set('org', [{ id: 'heat', size: 'L' }]);
    expect(resolveDashboards({ user: own, organization: org }).current).toBe('own');
    expect(resolveDashboards({ user: null, organization: org }).current).toBe('org');
    expect(resolveDashboards({ user: null, organization: null })).toEqual(defaultSet());
    expect(resolveDashboards(null).dashboards[0]!.widgets).toEqual(DEFAULT_WIDGETS);
    // an empty own dashboard is a choice, not "nothing saved"
    expect(currentDashboard(resolveDashboards({ user: set('own'), organization: org })).widgets).toEqual([]);
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

  it('keeps several dashboards: add, rename, open, delete (the last one stays)', () => {
    let state = addDashboard(defaultSet(), '  Руководителю  ', 1000);
    expect(state.dashboards.map((dashboard) => dashboard.name)).toEqual(['', 'Руководителю']);
    expect(state.current).toBe(state.dashboards[1]!.id);
    expect(currentDashboard(state).widgets).toEqual(DEFAULT_WIDGETS);
    state = withWidgets(state, [{ id: 'heat', size: 'S' }]);
    expect(state.dashboards[0]!.widgets).toEqual(DEFAULT_WIDGETS);
    expect(currentDashboard(state).widgets).toEqual([{ id: 'heat', size: 'S' }]);
    state = renameDashboard(state, state.current, 'Для отчёта');
    expect(currentDashboard(state).name).toBe('Для отчёта');
    expect(selectDashboard(state, 'main').current).toBe('main');
    expect(selectDashboard(state, 'nope').current).toBe(state.current);
    state = removeDashboard(state, state.current);
    expect(state.dashboards).toHaveLength(1);
    expect(state.current).toBe('main');
    expect(removeDashboard(state, 'main')).toBe(state);
  });

  it('gives every new dashboard its own id and stops at the limit', () => {
    let state = defaultSet();
    for (let index = 0; index < MAX_DASHBOARDS + 3; index += 1) state = addDashboard(state, `D${index}`, 5);
    expect(state.dashboards).toHaveLength(MAX_DASHBOARDS);
    expect(new Set(state.dashboards.map((dashboard) => dashboard.id)).size).toBe(MAX_DASHBOARDS);
    expect(state.dashboards.every((dashboard) => /^[a-z0-9-]{1,24}$/.test(dashboard.id))).toBe(true);
  });

  it('reads the options of a card, falling back to the default for anything unknown', () => {
    const widget = { id: 'people' as const, size: 'M' as const, options: { metric: 'sessions', limit: '99' } };
    expect(optionValue(widget, 'metric')).toBe('sessions');
    expect(optionValue(widget, 'limit')).toBe('5');
    expect(optionValue({ id: 'levels', size: 'M' }, 'scale')).toBe('all');
    expect(optionValue({ id: 'levels', size: 'M', options: { scale: 's1' } }, 'scale', ['all', 's1'])).toBe('s1');
    expect(optionValue({ id: 'levels', size: 'M', options: { scale: 'gone' } }, 'scale', ['all', 's1'])).toBe('all');
    expect(optionValues({ id: 'kpi', size: 'L' }, 'figures')).toEqual(['completion', 'average', 'done', 'overdue']);
    expect(optionValues({ id: 'kpi', size: 'L', options: { figures: ['queue', 'completion', 'junk'] } }, 'figures')).toEqual(['completion', 'queue']);
    expect(optionValues({ id: 'kpi', size: 'L', options: { figures: ['junk'] } }, 'figures')).toEqual(['completion', 'average', 'done', 'overdue']);
  });

  it('stores only what differs from the default', () => {
    const base = [{ id: 'trend' as const, size: 'M' as const }, { id: 'heat' as const, size: 'M' as const }];
    const changed = setWidgetOption(base, 'trend', 'metric', 'completion');
    expect(changed[0]).toEqual({ id: 'trend', size: 'M', options: { metric: 'completion' } });
    expect(changed[1]).toEqual(base[1]);
    expect(setWidgetOption(changed, 'trend', 'metric', 'average')[0]).toEqual({ id: 'trend', size: 'M' });
    expect(setWidgetOption(base, 'kpi' as never, 'figures', ['completion'])).toEqual(base);
    expect(setWidgetOption([{ id: 'kpi', size: 'L' }], 'kpi', 'figures', ['completion', 'queue'])[0]!.options).toEqual({ figures: ['completion', 'queue'] });
    expect(setWidgetOption([{ id: 'kpi', size: 'L' }], 'kpi', 'figures', ['completion', 'average', 'done', 'overdue'])[0]).toEqual({ id: 'kpi', size: 'L' });
  });

  it('tells whether a change is good news, depending on the figure', () => {
    expect(figureChange(80, 70, true)).toEqual({ delta: 10, good: true });
    expect(figureChange(3, 5, false)).toEqual({ delta: -2, good: true });
    expect(figureChange(7, 5, false)).toEqual({ delta: 2, good: false });
    expect(figureChange(null, 5, true)).toBeNull();
    expect(figureChange(5, null, true)).toBeNull();
  });

  it('reads the slice of the address bar and ignores anything else', () => {
    expect(parseSlice('result:good')).toEqual({ result: 'good' });
    expect(parseSlice('slot:2:4')).toEqual({ weekday: 2, block: 4 });
    expect(parseSlice('slot:7:4')).toBeNull();
    expect(parseSlice('slot:2:12')).toBeNull();
    expect(parseSlice('result:great')).toBeNull();
    expect(parseSlice('slot:2')).toBeNull();
    expect(parseSlice(null)).toBeNull();
  });
});
