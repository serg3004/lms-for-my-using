import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AnalyticsDashboardSet, AnalyticsWidget, AnalyticsWidgetId, AnalyticsWidgetSize } from '../shared/api/manager.js';
import { Card } from '../shared/ui.js';
import { MapBody } from './SheetAnalyticsMap.js';
import { scaleTitle, WIDGET_TITLES, WidgetBody, type WidgetBodyProps } from './SheetAnalyticsDashboard.js';
import {
  addDashboard, currentDashboard, MAX_DASHBOARDS, moveWidget, optionValue, optionValues, removeDashboard, renameDashboard, resizeWidget,
  selectDashboard, setWidgetOption, toggleWidget, WIDGET_IDS, WIDGET_OPTIONS, withWidgets,
} from './SheetAnalyticsLayout.js';

/** PR 520: the dashboards and their grid of cards, and the "Customize" mode: switches, size, source of each card, drag with the mouse or move with the arrows. */

const SIZES: readonly AnalyticsWidgetSize[] = ['S', 'M', 'L'];

type Translate = (key: string, fallback: string, options?: Record<string, unknown>) => string;

/** The name a dashboard shows: its own, or "Main" for the default one that has none. */
export const dashboardName = (name: string, t: Translate) => name || t('sheetAnalytics.dashboardMain', 'Main');

function CardOptions({ widget, data, widgets, onChange, t }: { widget: AnalyticsWidget; data: WidgetBodyProps['data']; widgets: AnalyticsWidget[]; onChange: (widgets: AnalyticsWidget[]) => void; t: Translate }) {
  const options = WIDGET_OPTIONS[widget.id];
  if (!options) return null;
  const title = t(WIDGET_TITLES[widget.id][0], WIDGET_TITLES[widget.id][1]);
  return (
    <div style={{ alignItems: 'end', display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
      {options.map((option) => {
        const label = `${t(option.label[0], option.label[1])}: ${title}`;
        if (option.kind === 'multi') {
          const picked = optionValues(widget, option.key);
          return (
            <fieldset key={option.key} style={{ border: 0, display: 'flex', flexWrap: 'wrap', gap: '2px 12px', margin: 0, minWidth: 0, padding: 0 }}>
              <legend style={{ fontSize: 12, fontWeight: 600, padding: 0 }}>{t(option.label[0], option.label[1])}</legend>
              {option.choices.map((choice) => (
                <label key={choice.value} style={{ alignItems: 'center', display: 'flex', gap: 6, minHeight: 28 }}>
                  <input
                    aria-label={`${t(choice.label[0], choice.label[1])}: ${title}`}
                    checked={picked.includes(choice.value)}
                    onChange={() => {
                      const next = picked.includes(choice.value) ? picked.filter((value) => value !== choice.value) : option.choices.map((entry) => entry.value).filter((value) => value === choice.value || picked.includes(value));
                      if (next.length > 0) onChange(setWidgetOption(widgets, widget.id, option.key, next));
                    }}
                    type="checkbox"
                  />
                  {t(choice.label[0], choice.label[1])}
                </label>
              ))}
            </fieldset>
          );
        }
        // The scales on offer depend on the data, so that card lists the ones the period really has.
        const choices = widget.id === 'levels' && option.key === 'scale'
          ? [{ value: 'all', label: t('sheetAnalytics.optAllScales', 'All scales') }, ...data.total.scales.map((scale) => ({ value: scale.scaleKey, label: scaleTitle(scale, t) }))]
          : option.choices.map((choice) => ({ value: choice.value, label: t(choice.label[0], choice.label[1]) }));
        return (
          <label key={option.key} style={{ display: 'grid', fontSize: 12, fontWeight: 600, gap: 2 }}>
            {t(option.label[0], option.label[1])}
            <select aria-label={label} className="ds-input" onChange={(event) => onChange(setWidgetOption(widgets, widget.id, option.key, event.target.value))} value={optionValue(widget, option.key, choices.map((choice) => choice.value))}>
              {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
            </select>
          </label>
        );
      })}
    </div>
  );
}

function DashboardTabs({ set, onChange, editing, t }: { set: AnalyticsDashboardSet; onChange: (set: AnalyticsDashboardSet) => void; editing: boolean; t: Translate }) {
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const open = currentDashboard(set);
  if (set.dashboards.length < 2 && !editing) return null;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div aria-label={t('sheetAnalytics.dashboards', 'Dashboards')} role="group" style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {set.dashboards.map((dashboard) => (
          <button aria-pressed={dashboard.id === open.id} className={`ds-button ${dashboard.id === open.id ? 'ds-button--primary' : 'ds-button--secondary'} ds-button--sm`} key={dashboard.id} onClick={() => { setAdding(false); setRenaming(false); onChange(selectDashboard(set, dashboard.id)); }} type="button">
            {dashboardName(dashboard.name, t)}
          </button>
        ))}
        {editing && (
          <>
            <button className="ds-button ds-button--secondary ds-button--sm" disabled={set.dashboards.length >= MAX_DASHBOARDS} onClick={() => { setName(''); setRenaming(false); setAdding(true); }} type="button">+ {t('sheetAnalytics.dashboardNew', 'New dashboard')}</button>
            <button className="ds-button ds-button--secondary ds-button--sm" onClick={() => { setName(open.name); setAdding(false); setRenaming(true); }} type="button">{t('sheetAnalytics.dashboardRename', 'Rename')}</button>
            <button className="ds-button ds-button--secondary ds-button--sm" disabled={set.dashboards.length <= 1} onClick={() => onChange(removeDashboard(set, open.id))} type="button">{t('sheetAnalytics.dashboardDelete', 'Delete dashboard')}</button>
          </>
        )}
      </div>
      {editing && (adding || renaming) && (
        <form onSubmit={(event) => { event.preventDefault(); onChange(adding ? addDashboard(set, name) : renameDashboard(set, open.id, name)); setAdding(false); setRenaming(false); }} style={{ alignItems: 'end', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <label style={{ display: 'grid', fontSize: 12, fontWeight: 600, gap: 2 }}>
            {t('sheetAnalytics.dashboardName', 'Dashboard name')}
            <input className="ds-input" maxLength={60} onChange={(event) => setName(event.target.value)} placeholder={t('sheetAnalytics.dashboardNamePlaceholder', 'For example: For the manager')} value={name} />
          </label>
          <button className="ds-button ds-button--primary ds-button--sm" type="submit">{adding ? t('sheetAnalytics.dashboardCreate', 'Create') : t('sheetAnalytics.dashboardSave', 'Save name')}</button>
          <button className="ds-button ds-button--secondary ds-button--sm" onClick={() => { setAdding(false); setRenaming(false); }} type="button">{t('sheetAnalytics.dashboardCancel', 'Cancel')}</button>
        </form>
      )}
    </div>
  );
}

export function DashboardGrid({ set, onChange, editing, isAdmin, busy, failed, onReset, onSaveOrganization, ...body }: Omit<WidgetBodyProps, 't'> & {
  set: AnalyticsDashboardSet;
  onChange: (set: AnalyticsDashboardSet) => void;
  editing: boolean;
  isAdmin: boolean;
  busy: boolean;
  failed: boolean;
  onReset: () => void;
  onSaveOrganization: () => void;
}) {
  const { t: translate } = useTranslation();
  const t = translate as unknown as Translate;
  // The source of a drag is kept in a ref (the handlers read it at once); the look of the card changes a tick later, because changing the dragged element inside `dragstart` cancels the drag in Chrome.
  const dragRef = useRef<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const widgets = currentDashboard(set).widgets;
  const change = (next: AnalyticsWidget[]) => onChange(withWidgets(set, next));
  const title = (id: AnalyticsWidgetId) => t(WIDGET_TITLES[id][0], WIDGET_TITLES[id][1]);

  return (
    <>
      <DashboardTabs editing={editing} onChange={onChange} set={set} t={t} />
      {editing && (
        <Card style={{ background: 'var(--color-accent-muted)', borderStyle: 'dashed', display: 'grid', gap: 10 }}>
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <strong>{t('sheetAnalytics.customizeTitle', 'Dashboard settings.')}</strong>
            <span style={{ flex: 1, minWidth: 200 }}>{t('sheetAnalytics.customizeHint', 'Turn cards on and off, drag them with the mouse or move them with the arrows, change their size and what they show. It is saved for you.')}</span>
            <button className="ds-button ds-button--secondary ds-button--sm" disabled={busy} onClick={onReset} type="button">{t('sheetAnalytics.customizeReset', 'Back to default')}</button>
            {isAdmin && <button className="ds-button ds-button--secondary ds-button--sm" disabled={busy} onClick={onSaveOrganization} type="button">{t('sheetAnalytics.customizeOrganization', 'Make default for everyone')}</button>}
          </div>
          {failed && <p role="alert" style={{ margin: 0 }}>{t('sheetAnalytics.customizeError', 'The dashboard could not be saved.')}</p>}
          <div aria-label={t('sheetAnalytics.customizeSwitches', 'Cards to show')} role="group" style={{ display: 'grid', gap: '2px 16px', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
            {WIDGET_IDS.map((id) => (
              <label key={id} style={{ alignItems: 'center', cursor: 'pointer', display: 'flex', gap: 10, minHeight: 36 }}>
                <input checked={widgets.some((widget) => widget.id === id)} onChange={() => change(toggleWidget(widgets, id))} style={{ flex: 'none', height: 20, width: 20 }} type="checkbox" />
                {title(id)}
              </label>
            ))}
          </div>
        </Card>
      )}
      {widgets.length === 0 ? (
        <Card><strong>{t('sheetAnalytics.dashboardEmpty', 'The dashboard is empty.')}</strong> <span style={{ color: 'var(--color-text-muted)' }}>{t('sheetAnalytics.dashboardEmptyHint', 'Press "Customize dashboard" and add cards.')}</span></Card>
      ) : (
        <div className="sheet-analytics-grid">
          {widgets.map((widget, index) => (
            <section
              aria-label={title(widget.id)}
              className={`ds-card sheet-analytics-widget sheet-analytics-widget--${widget.size.toLowerCase()}`}
              data-testid={`sheet-analytics-widget-${widget.id}`}
              draggable={editing}
              key={widget.id}
              onDragEnd={() => { dragRef.current = null; setDragFrom(null); setOver(null); }}
              onDragOver={(event) => { if (editing && dragRef.current !== null) { event.preventDefault(); if (over !== index) setOver(index); } }}
              onDragStart={(event) => { if (!editing) return; dragRef.current = index; window.setTimeout(() => setDragFrom(index), 0); event.dataTransfer.effectAllowed = 'move'; try { event.dataTransfer.setData('text/plain', widget.id); } catch { /* some browsers refuse */ } }}
              onDrop={(event) => { const from = dragRef.current; if (!editing || from === null) return; event.preventDefault(); change(moveWidget(widgets, from, index)); dragRef.current = null; setDragFrom(null); setOver(null); }}
              style={{
                cursor: editing ? 'grab' : undefined,
                opacity: dragFrom === index ? 0.4 : undefined,
                outline: editing ? `2px ${over === index && dragFrom !== index ? 'solid var(--color-primary)' : 'dashed var(--color-border)'}` : undefined,
                outlineOffset: 2,
              }}
            >
              <div style={{ alignItems: 'center', display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: 18, margin: 0 }}>{editing && <span aria-hidden="true" style={{ color: 'var(--color-text-muted)', marginRight: 6 }}>⋮⋮</span>}{title(widget.id)}</h2>
                {editing && (
                  <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
                    {SIZES.map((size) => (
                      <button aria-label={`${t('sheetAnalytics.size', 'Size')} ${size}: ${title(widget.id)}`} aria-pressed={widget.size === size} className="ds-button ds-button--secondary ds-button--sm" key={size} onClick={() => change(resizeWidget(widgets, widget.id, size))} style={widget.size === size ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' } : undefined} type="button">{size}</button>
                    ))}
                    <button aria-label={`${t('sheetAnalytics.moveUp', 'Move up')}: ${title(widget.id)}`} className="ds-button ds-button--secondary ds-button--sm" disabled={index === 0} onClick={() => change(moveWidget(widgets, index, index - 1))} type="button">↑</button>
                    <button aria-label={`${t('sheetAnalytics.moveDown', 'Move down')}: ${title(widget.id)}`} className="ds-button ds-button--secondary ds-button--sm" disabled={index === widgets.length - 1} onClick={() => change(moveWidget(widgets, index, index + 1))} type="button">↓</button>
                    <button aria-label={`${t('sheetAnalytics.removeWidget', 'Remove card')}: ${title(widget.id)}`} className="ds-button ds-button--secondary ds-button--sm" onClick={() => change(toggleWidget(widgets, widget.id))} type="button">✕</button>
                  </span>
                )}
              </div>
              {editing && <CardOptions data={body.data} onChange={change} t={t} widget={widget} widgets={widgets} />}
              {widget.id === 'map'
                ? <MapBody detailsHref={body.detailsHref} query={body.placesQuery} sessionPath={body.sessionPath} t={t} widget={widget} />
                : <WidgetBody {...body} t={t} widget={widget} />}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
