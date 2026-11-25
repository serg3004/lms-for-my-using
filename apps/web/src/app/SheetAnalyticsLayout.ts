import type { AnalyticsDashboard, AnalyticsDashboardLayout, AnalyticsDashboardSet, AnalyticsWidget, AnalyticsWidgetId, AnalyticsWidgetSize } from '../shared/api/manager.js';

/** PR 520: the dashboards of the analytics page and the options of their cards. Pure helpers: the page only keeps and saves the set. */
export const WIDGET_IDS: readonly AnalyticsWidgetId[] = ['kpi', 'levels', 'donut', 'trend', 'depts', 'weak', 'heat', 'people', 'map'];
export const MAX_DASHBOARDS = 10;
export const MAIN_DASHBOARD_ID = 'main';

/** The built-in set, used until the user or the administrator saves another one. */
export const DEFAULT_WIDGETS: readonly AnalyticsWidget[] = [
  { id: 'kpi', size: 'L' }, { id: 'trend', size: 'M' }, { id: 'levels', size: 'M' }, { id: 'donut', size: 'M' },
  { id: 'depts', size: 'M' }, { id: 'weak', size: 'M' }, { id: 'heat', size: 'M' }, { id: 'people', size: 'M' },
];

const cloneWidgets = (widgets: readonly AnalyticsWidget[]): AnalyticsWidget[] => widgets.map((widget) => ({ ...widget, ...(widget.options ? { options: { ...widget.options } } : {}) }));

export const defaultSet = (): AnalyticsDashboardSet => ({ version: 2, current: MAIN_DASHBOARD_ID, dashboards: [{ id: MAIN_DASHBOARD_ID, name: '', widgets: cloneWidgets(DEFAULT_WIDGETS) }] });

/** The user's own dashboards, else the organization default, else the built-in set. */
export function resolveDashboards(layout: AnalyticsDashboardLayout | null): AnalyticsDashboardSet {
  const found = layout?.user ?? layout?.organization;
  return found ? { ...found, dashboards: found.dashboards.map((dashboard) => ({ ...dashboard, widgets: cloneWidgets(dashboard.widgets) })) } : defaultSet();
}

export function currentDashboard(set: AnalyticsDashboardSet): AnalyticsDashboard {
  return set.dashboards.find((dashboard) => dashboard.id === set.current) ?? set.dashboards[0]!;
}

/** Replaces the cards of the open dashboard. */
export function withWidgets(set: AnalyticsDashboardSet, widgets: AnalyticsWidget[]): AnalyticsDashboardSet {
  const open = currentDashboard(set).id;
  return { ...set, dashboards: set.dashboards.map((dashboard) => (dashboard.id === open ? { ...dashboard, widgets } : dashboard)) };
}

export function selectDashboard(set: AnalyticsDashboardSet, id: string): AnalyticsDashboardSet {
  return set.dashboards.some((dashboard) => dashboard.id === id) ? { ...set, current: id } : set;
}

/** Adds a dashboard with the built-in cards and opens it; nothing changes past the limit. */
export function addDashboard(set: AnalyticsDashboardSet, name: string, seed = Date.now()): AnalyticsDashboardSet {
  if (set.dashboards.length >= MAX_DASHBOARDS) return set;
  let id = `d${seed.toString(36)}`.slice(0, 24);
  for (let attempt = 0; set.dashboards.some((dashboard) => dashboard.id === id); attempt += 1) id = `d${(seed + attempt + 1).toString(36)}`.slice(0, 24);
  return { ...set, current: id, dashboards: [...set.dashboards, { id, name: name.trim().slice(0, 60), widgets: cloneWidgets(DEFAULT_WIDGETS) }] };
}

export function renameDashboard(set: AnalyticsDashboardSet, id: string, name: string): AnalyticsDashboardSet {
  return { ...set, dashboards: set.dashboards.map((dashboard) => (dashboard.id === id ? { ...dashboard, name: name.trim().slice(0, 60) } : dashboard)) };
}

/** Removes a dashboard; the last one stays. If the open one goes, the first remaining opens. */
export function removeDashboard(set: AnalyticsDashboardSet, id: string): AnalyticsDashboardSet {
  if (set.dashboards.length <= 1) return set;
  const dashboards = set.dashboards.filter((dashboard) => dashboard.id !== id);
  return { ...set, dashboards, current: set.current === id ? dashboards[0]!.id : set.current };
}

export const defaultSize = (id: AnalyticsWidgetId): AnalyticsWidgetSize => (id === 'kpi' || id === 'map' ? 'L' : 'M');

/** Turns a card on (at the end) or off. */
export function toggleWidget(widgets: readonly AnalyticsWidget[], id: AnalyticsWidgetId): AnalyticsWidget[] {
  return widgets.some((widget) => widget.id === id) ? widgets.filter((widget) => widget.id !== id) : [...widgets, { id, size: defaultSize(id) }];
}

export function resizeWidget(widgets: readonly AnalyticsWidget[], id: AnalyticsWidgetId, size: AnalyticsWidgetSize): AnalyticsWidget[] {
  return widgets.map((widget) => (widget.id === id ? { ...widget, size } : widget));
}

/** Moves the card at `from` to the place `to` (drag and drop); out-of-range or equal places change nothing. */
export function moveWidget(widgets: readonly AnalyticsWidget[], from: number, to: number): AnalyticsWidget[] {
  if (from === to || from < 0 || to < 0 || from >= widgets.length || to >= widgets.length) return [...widgets];
  const next = [...widgets];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

// ---- the source options of a card ----

export type WidgetOption = { key: string; kind: 'select' | 'multi'; label: [string, string]; choices: Array<{ value: string; label: [string, string] }>; defaults: string[] };

const KPI_FIGURES = ['completion', 'average', 'done', 'overdue', 'answered', 'queue', 'guests'] as const;
export const KPI_DEFAULT_FIGURES: readonly string[] = ['completion', 'average', 'done', 'overdue'];

/** The options each card offers, within the filters of the page (period, checklists, department, employee). */
export const WIDGET_OPTIONS: Partial<Record<AnalyticsWidgetId, WidgetOption[]>> = {
  kpi: [{ key: 'figures', kind: 'multi', label: ['sheetAnalytics.optFigures', 'Figures'], defaults: [...KPI_DEFAULT_FIGURES], choices: KPI_FIGURES.map((value) => ({ value, label: [`sheetAnalytics.fig_${value}`, value] as [string, string] })) }],
  levels: [{ key: 'scale', kind: 'select', label: ['sheetAnalytics.optScale', 'Scale'], defaults: ['all'], choices: [{ value: 'all', label: ['sheetAnalytics.optAllScales', 'All scales'] }] }],
  donut: [{ key: 'by', kind: 'select', label: ['sheetAnalytics.optShow', 'Show'], defaults: ['results'], choices: [{ value: 'results', label: ['sheetAnalytics.optByResults', 'By result'] }, { value: 'plan', label: ['sheetAnalytics.optByPlan', 'By status of the plan'] }] }],
  trend: [{ key: 'metric', kind: 'select', label: ['sheetAnalytics.optMetric', 'Metric'], defaults: ['average'], choices: [{ value: 'average', label: ['sheetAnalytics.average', 'Average score'] }, { value: 'completion', label: ['sheetAnalytics.completion', 'Completion'] }, { value: 'done', label: ['sheetAnalytics.colFact', 'Done'] }] }],
  depts: [{ key: 'metric', kind: 'select', label: ['sheetAnalytics.optMetric', 'Metric'], defaults: ['completion'], choices: [{ value: 'completion', label: ['sheetAnalytics.completion', 'Completion'] }, { value: 'average', label: ['sheetAnalytics.average', 'Average score'] }] }],
  weak: [{ key: 'limit', kind: 'select', label: ['sheetAnalytics.optLimit', 'How many'], defaults: ['5'], choices: [{ value: '5', label: ['sheetAnalytics.optTop5', '5'] }, { value: '10', label: ['sheetAnalytics.optTop10', '10'] }] }],
  heat: [{ key: 'days', kind: 'select', label: ['sheetAnalytics.optDays', 'Days'], defaults: ['all'], choices: [{ value: 'all', label: ['sheetAnalytics.optAllDays', 'Every day'] }, { value: 'work', label: ['sheetAnalytics.optWorkDays', 'Monday to Friday'] }] }],
  map: [{ key: 'view', kind: 'select', label: ['sheetAnalytics.optMapView', 'View'], defaults: ['points'], choices: [{ value: 'points', label: ['sheetAnalytics.optMapPoints', 'Points by result'] }, { value: 'density', label: ['sheetAnalytics.optMapDensity', 'Density'] }] }],
  people: [
    { key: 'metric', kind: 'select', label: ['sheetAnalytics.optMetric', 'Metric'], defaults: ['average'], choices: [{ value: 'average', label: ['sheetAnalytics.average', 'Average score'] }, { value: 'sessions', label: ['sheetAnalytics.optChecks', 'Number of checks'] }] },
    { key: 'limit', kind: 'select', label: ['sheetAnalytics.optLimit', 'How many'], defaults: ['5'], choices: [{ value: '5', label: ['sheetAnalytics.optTop5', '5'] }, { value: '10', label: ['sheetAnalytics.optTop10', '10'] }] },
  ],
};

/** The chosen value of a select option; anything that is not one of the allowed choices falls back to the default. `allowed` replaces the choices that depend on data. */
export function optionValue(widget: AnalyticsWidget, key: string, allowed?: readonly string[]): string {
  const option = WIDGET_OPTIONS[widget.id]?.find((entry) => entry.key === key);
  const values = allowed ?? option?.choices.map((choice) => choice.value) ?? [];
  const picked = widget.options?.[key];
  return typeof picked === 'string' && values.includes(picked) ? picked : option?.defaults[0] ?? '';
}

/** The chosen values of a multi option, in the order of the choices; an empty or unknown pick falls back to the default. */
export function optionValues(widget: AnalyticsWidget, key: string): string[] {
  const option = WIDGET_OPTIONS[widget.id]?.find((entry) => entry.key === key);
  const picked = widget.options?.[key];
  const valid = Array.isArray(picked) ? option?.choices.map((choice) => choice.value).filter((value) => picked.includes(value)) ?? [] : [];
  return valid.length > 0 ? valid : option?.defaults ?? [];
}

/** Sets one option of one card; a value equal to the default is removed, so the saved set stays small. */
export function setWidgetOption(widgets: readonly AnalyticsWidget[], id: AnalyticsWidgetId, key: string, value: string | string[]): AnalyticsWidget[] {
  const defaults = WIDGET_OPTIONS[id]?.find((entry) => entry.key === key)?.defaults ?? [];
  const isDefault = Array.isArray(value) ? value.length === defaults.length && value.every((entry, index) => entry === defaults[index]) : value === defaults[0];
  return widgets.map((widget) => {
    if (widget.id !== id) return widget;
    const options = { ...widget.options };
    if (isDefault) delete options[key]; else options[key] = value;
    return { id: widget.id, size: widget.size, ...(Object.keys(options).length > 0 ? { options } : {}) };
  });
}

/** The change of a key figure against the previous period, as a number to print and whether it is good news. */
export function figureChange(current: number | null, previous: number | null | undefined, goodWhenUp: boolean): { delta: number; good: boolean } | null {
  if (current === null || previous === null || previous === undefined) return null;
  const delta = current - previous;
  return { delta, good: delta === 0 ? true : goodWhenUp ? delta > 0 : delta < 0 };
}

/** The slice of the address bar (`result:good`, `slot:2:4`) as the query of the results list, or null when it is not one. */
export function parseSlice(value: string | null): { result: 'good' | 'mid' | 'bad' } | { weekday: number; block: number } | null {
  const [kind, first, second] = (value ?? '').split(':');
  if (kind === 'result' && (first === 'good' || first === 'mid' || first === 'bad')) return { result: first };
  const weekday = Number(first);
  const block = Number(second);
  if (kind === 'slot' && Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 && Number.isInteger(block) && block >= 0 && block <= 11) return { weekday, block };
  return null;
}
