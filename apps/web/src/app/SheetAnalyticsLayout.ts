import type { AnalyticsDashboardLayout, AnalyticsWidget, AnalyticsWidgetId, AnalyticsWidgetSize } from '../shared/api/manager.js';

/** PR 520: the widgets of the analytics dashboard, in the order of the library. Pure helpers: the page only keeps and saves the list. */
export const WIDGET_IDS: readonly AnalyticsWidgetId[] = ['kpi', 'levels', 'donut', 'trend', 'depts', 'weak', 'heat', 'people'];

/** The built-in set, used until the user or the administrator saves another one. */
export const DEFAULT_WIDGETS: readonly AnalyticsWidget[] = [
  { id: 'kpi', size: 'L' }, { id: 'trend', size: 'M' }, { id: 'levels', size: 'M' }, { id: 'donut', size: 'M' },
  { id: 'depts', size: 'M' }, { id: 'weak', size: 'M' }, { id: 'heat', size: 'M' }, { id: 'people', size: 'M' },
];

/** The user's own layout, else the organization default, else the built-in set. */
export function resolveWidgets(layout: AnalyticsDashboardLayout | null): AnalyticsWidget[] {
  return (layout?.user ?? layout?.organization)?.widgets.map((widget) => ({ ...widget })) ?? DEFAULT_WIDGETS.map((widget) => ({ ...widget }));
}

export const defaultSize = (id: AnalyticsWidgetId): AnalyticsWidgetSize => (id === 'kpi' ? 'L' : 'M');

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

/** The change of a key figure against the previous period, as a number to print and whether it is good news. */
export function figureChange(current: number | null, previous: number | null | undefined, goodWhenUp: boolean): { delta: number; good: boolean } | null {
  if (current === null || previous === null || previous === undefined) return null;
  const delta = current - previous;
  return { delta, good: delta === 0 ? true : goodWhenUp ? delta > 0 : delta < 0 };
}
