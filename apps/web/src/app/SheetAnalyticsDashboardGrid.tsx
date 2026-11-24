import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AnalyticsWidget, AnalyticsWidgetId, AnalyticsWidgetSize } from '../shared/api/manager.js';
import { Card } from '../shared/ui.js';
import { WIDGET_TITLES, WidgetBody, type WidgetBodyProps } from './SheetAnalyticsDashboard.js';
import { moveWidget, resizeWidget, toggleWidget, WIDGET_IDS } from './SheetAnalyticsLayout.js';

/** PR 520: the grid of widgets and its "Customize" mode: switches per card, size, drag with the mouse or move with the arrows. */

const SIZES: readonly AnalyticsWidgetSize[] = ['S', 'M', 'L'];

export function DashboardGrid({ widgets, onChange, editing, isAdmin, busy, failed, onReset, onSaveOrganization, ...body }: Omit<WidgetBodyProps, 't'> & {
  widgets: AnalyticsWidget[];
  onChange: (widgets: AnalyticsWidget[]) => void;
  editing: boolean;
  isAdmin: boolean;
  busy: boolean;
  failed: boolean;
  onReset: () => void;
  onSaveOrganization: () => void;
}) {
  const { t: translate } = useTranslation();
  const t = translate as unknown as (key: string, fallback: string, options?: Record<string, unknown>) => string;
  // The source of a drag is kept in a ref (the handlers read it at once); the look of the card changes a tick later, because changing the dragged element inside `dragstart` cancels the drag in Chrome.
  const dragRef = useRef<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const title = (id: AnalyticsWidgetId) => t(WIDGET_TITLES[id][0], WIDGET_TITLES[id][1]);

  return (
    <>
      {editing && (
        <Card style={{ background: 'var(--color-accent-muted)', borderStyle: 'dashed', display: 'grid', gap: 10 }}>
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <strong>{t('sheetAnalytics.customizeTitle', 'Dashboard settings.')}</strong>
            <span style={{ flex: 1, minWidth: 200 }}>{t('sheetAnalytics.customizeHint', 'Turn cards on and off, drag them with the mouse or move them with the arrows, change their size. A card that is off is not in the export either. It is saved for you.')}</span>
            <button className="ds-button ds-button--secondary ds-button--sm" disabled={busy} onClick={onReset} type="button">{t('sheetAnalytics.customizeReset', 'Back to default')}</button>
            {isAdmin && <button className="ds-button ds-button--secondary ds-button--sm" disabled={busy} onClick={onSaveOrganization} type="button">{t('sheetAnalytics.customizeOrganization', 'Make default for everyone')}</button>}
          </div>
          {failed && <p role="alert" style={{ margin: 0 }}>{t('sheetAnalytics.customizeError', 'The dashboard could not be saved.')}</p>}
          <div aria-label={t('sheetAnalytics.customizeSwitches', 'Cards to show')} role="group" style={{ display: 'grid', gap: '2px 16px', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
            {WIDGET_IDS.map((id) => (
              <label key={id} style={{ alignItems: 'center', cursor: 'pointer', display: 'flex', gap: 10, minHeight: 36 }}>
                <input checked={widgets.some((widget) => widget.id === id)} onChange={() => onChange(toggleWidget(widgets, id))} style={{ flex: 'none', height: 20, width: 20 }} type="checkbox" />
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
              onDrop={(event) => { const from = dragRef.current; if (!editing || from === null) return; event.preventDefault(); onChange(moveWidget(widgets, from, index)); dragRef.current = null; setDragFrom(null); setOver(null); }}
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
                      <button aria-label={`${t('sheetAnalytics.size', 'Size')} ${size}: ${title(widget.id)}`} aria-pressed={widget.size === size} className="ds-button ds-button--secondary ds-button--sm" key={size} onClick={() => onChange(resizeWidget(widgets, widget.id, size))} style={widget.size === size ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' } : undefined} type="button">{size}</button>
                    ))}
                    <button aria-label={`${t('sheetAnalytics.moveUp', 'Move up')}: ${title(widget.id)}`} className="ds-button ds-button--secondary ds-button--sm" disabled={index === 0} onClick={() => onChange(moveWidget(widgets, index, index - 1))} type="button">↑</button>
                    <button aria-label={`${t('sheetAnalytics.moveDown', 'Move down')}: ${title(widget.id)}`} className="ds-button ds-button--secondary ds-button--sm" disabled={index === widgets.length - 1} onClick={() => onChange(moveWidget(widgets, index, index + 1))} type="button">↓</button>
                    <button aria-label={`${t('sheetAnalytics.removeWidget', 'Remove card')}: ${title(widget.id)}`} className="ds-button ds-button--secondary ds-button--sm" onClick={() => onChange(toggleWidget(widgets, widget.id))} type="button">✕</button>
                  </span>
                )}
              </div>
              <WidgetBody {...body} id={widget.id} t={t} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
