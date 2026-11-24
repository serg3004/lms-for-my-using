import { plainText } from '@lms/shared/rich-text';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';

import { getSheetAnalyticsPlaces, type AnalyticsWidget, type SheetAnalyticsPlace, type SheetAnalyticsQuery } from '../shared/api/manager.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { rateColor } from './SheetAnalyticsDashboard.js';
import { optionValue } from './SheetAnalyticsLayout.js';
import { COARSE_ACCURACY_METERS, fitView, metersPerPixel, pan, toScreen, visibleTiles, zoomBy, type View } from './SheetAnalyticsMapGeometry.js';

/**
 * PR 521: the "Check map" card. Points are the finished checks that have a geolocation (start or end of the session, taken only where the
 * sheet asks for it and the person allowed it). The background is OpenStreetMap tiles drawn by this card (no map library); the tile
 * server sees which area is open, never the coordinates of the checks. Without tiles the points stay on a plain background.
 */

type Translate = (key: string, fallback: string, options?: Record<string, unknown>) => string;

const HEIGHT = 320;
const TEXT_LIST = 50;
const tileUrl = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const muted = { color: 'var(--color-text-muted)' } as const;
const control = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text)', cursor: 'pointer', font: 'inherit', fontSize: 18, height: 36, lineHeight: 1, width: 36 } as const;

const pointColor = (place: SheetAnalyticsPlace) => rateColor(place.percentage);

function resultText(place: SheetAnalyticsPlace, t: Translate): string {
  return place.percentage === null ? t('sheetAnalytics.mapNoScore', 'no score') : `${place.percentage}%`;
}

function PlaceCard({ place, detailsHref, sessionPath, onClose, t }: { place: SheetAnalyticsPlace; detailsHref: (checklistId: string) => string; sessionPath?: (sessionId: string) => string; onClose: () => void; t: Translate }) {
  return (
    <div role="status" style={{ background: 'var(--color-surface-muted)', borderRadius: 8, display: 'grid', gap: 4, padding: '10px 12px' }}>
      <div style={{ alignItems: 'start', display: 'flex', gap: 8, justifyContent: 'space-between' }}>
        <strong style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{plainText(place.checklistTitle)}</strong>
        <button aria-label={t('sheetAnalytics.mapClose', 'Close details')} className="ds-button ds-button--secondary ds-button--sm" onClick={onClose} type="button">✕</button>
      </div>
      <span>{place.employee || '—'} · {new Date(place.at).toLocaleString()}</span>
      <span>
        {t('sheetAnalytics.mapResult', 'Result')}: <strong style={{ color: pointColor(place) }}>{resultText(place, t)}</strong>
        <span style={muted}> · {place.point === 'end' ? t('sheetAnalytics.mapPointEnd', 'place at the end') : t('sheetAnalytics.mapPointStart', 'place at the start')}
          {place.accuracyMeters !== null ? ` · ${t('sheetAnalytics.mapAccuracy', 'accuracy {{meters}} m', { meters: place.accuracyMeters })}` : ''}</span>
      </span>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Link to={detailsHref(place.checklistId)}>{t('sheetAnalytics.mapOpenSheet', 'Open the checklist results')}</Link>
        {sessionPath ? <Link to={sessionPath(place.sessionId)}>{t('sheetAnalytics.mapOpenReport', 'Open the report')}</Link> : null}
      </span>
    </div>
  );
}

function MapCanvas({ places, density, detailsHref, sessionPath, t }: { places: SheetAnalyticsPlace[]; density: boolean; detailsHref: (checklistId: string) => string; sessionPath?: (sessionId: string) => string; t: Translate }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [width, setWidth] = useState(600);
  const [view, setView] = useState<View>(() => fitView(places, 600, HEIGHT));
  const [selected, setSelected] = useState<string | null>(null);
  const [tileFailed, setTileFailed] = useState(false);
  const [tilesKey, setTilesKey] = useState(0);
  const fitted = useRef(false);

  useEffect(() => {
    const element = box.current;
    if (!element) return undefined;
    const measure = () => setWidth(Math.max(200, Math.round(element.getBoundingClientRect().width) || 600));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // The first measured width decides the first zoom; later resizes keep what the person looks at.
  useEffect(() => {
    if (!fitted.current) { fitted.current = true; setView(fitView(places, width, HEIGHT)); }
  }, [places, width]);

  const showAll = useCallback(() => { setView(fitView(places, width, HEIGHT)); }, [places, width]);
  const tiles = useMemo(() => visibleTiles(view, width, HEIGHT), [view, width]);
  const placed = useMemo(() => places.map((place) => ({ place, ...toScreen(place, view, width, HEIGHT) })).filter((entry) => entry.x > -40 && entry.x < width + 40 && entry.y > -40 && entry.y < HEIGHT + 40), [places, view, width]);
  const chosen = places.find((place) => place.sessionId === selected) ?? null;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const from = drag.current;
    if (!from) return;
    const dx = event.clientX - from.x, dy = event.clientY - from.y;
    drag.current = { x: event.clientX, y: event.clientY };
    setView((current) => pan(current, dx, dy));
  };
  const onPointerUp = () => { drag.current = null; };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = 80;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const move = moves[event.key];
    if (move) { event.preventDefault(); setView((current) => pan(current, move[0], move[1])); }
    else if (event.key === '+' || event.key === '=') setView((current) => zoomBy(current, 1));
    else if (event.key === '-') setView((current) => zoomBy(current, -1));
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div
        aria-label={t('sheetAnalytics.mapLabel', 'Map of checks. Arrow keys move it, plus and minus zoom.')}
        onDoubleClick={() => setView((current) => zoomBy(current, 1))}
        onKeyDown={onKeyDown}
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        ref={box}
        role="group"
        style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)', borderRadius: 8, cursor: 'grab', height: HEIGHT, overflow: 'hidden', position: 'relative', touchAction: 'none', userSelect: 'none' }}
        tabIndex={0}
      >
        <div key={tilesKey}>
          {tiles.map((tile) => (
            <img alt="" draggable={false} height={256} key={tile.key} onError={() => setTileFailed(true)} onLoad={() => setTileFailed(false)} src={tileUrl(tile.z, tile.x, tile.y)} style={{ left: tile.left, maxWidth: 'none', position: 'absolute', top: tile.top }} width={256} />
          ))}
        </div>
        {placed.map(({ place, x, y }) => {
          const meters = place.accuracyMeters;
          const radius = meters !== null && meters >= COARSE_ACCURACY_METERS ? meters / metersPerPixel(place.latitude, view.zoom) : 0;
          const isChosen = place.sessionId === selected;
          return (
            <span key={place.sessionId}>
              {radius >= 6 && <span aria-hidden="true" style={{ background: pointColor(place), borderRadius: '50%', height: radius * 2, left: x - radius, opacity: 0.15, pointerEvents: 'none', position: 'absolute', top: y - radius, width: radius * 2 }} />}
              {density && <span aria-hidden="true" style={{ background: 'radial-gradient(circle, var(--color-primary) 0%, transparent 70%)', borderRadius: '50%', height: 64, left: x - 32, opacity: 0.35, pointerEvents: 'none', position: 'absolute', top: y - 32, width: 64 }} />}
              <button
                aria-label={`${plainText(place.checklistTitle)}, ${place.employee || '—'}, ${new Date(place.at).toLocaleString()}, ${resultText(place, t)}`}
                aria-pressed={isChosen}
                onClick={() => setSelected(isChosen ? null : place.sessionId)}
                onPointerDown={(event) => event.stopPropagation()}
                style={{ background: density ? 'var(--color-primary)' : pointColor(place), border: '2px solid var(--color-surface)', borderRadius: '50%', boxShadow: isChosen ? '0 0 0 3px var(--color-primary)' : '0 1px 3px rgba(0,0,0,0.4)', cursor: 'pointer', height: density ? 12 : 18, left: x - (density ? 6 : 9), padding: 0, position: 'absolute', top: y - (density ? 6 : 9), width: density ? 12 : 18 }}
                type="button"
              />
            </span>
          );
        })}
        <div style={{ display: 'grid', gap: 4, position: 'absolute', right: 8, top: 8 }}>
          <button aria-label={t('sheetAnalytics.mapZoomIn', 'Zoom in')} onClick={() => setView((current) => zoomBy(current, 1))} onPointerDown={(event) => event.stopPropagation()} style={control} type="button">+</button>
          <button aria-label={t('sheetAnalytics.mapZoomOut', 'Zoom out')} onClick={() => setView((current) => zoomBy(current, -1))} onPointerDown={(event) => event.stopPropagation()} style={control} type="button">−</button>
          <button aria-label={t('sheetAnalytics.mapShowAll', 'Show all checks')} onClick={showAll} onPointerDown={(event) => event.stopPropagation()} style={{ ...control, fontSize: 14 }} title={t('sheetAnalytics.mapShowAll', 'Show all checks')} type="button">⤢</button>
        </div>
        <span style={{ background: 'var(--color-surface)', borderRadius: 4, bottom: 4, fontSize: 11, opacity: 0.9, padding: '1px 6px', position: 'absolute', right: 4 }}>
          <a href="https://www.openstreetmap.org/copyright" onPointerDown={(event) => event.stopPropagation()} rel="noreferrer" target="_blank">© OpenStreetMap</a>
        </span>
      </div>
      {tileFailed && (
        <div role="alert" style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <span>{t('sheetAnalytics.mapTilesFailed', 'The map background did not load. The points are still in place.')}</span>
          <button className="ds-button ds-button--secondary ds-button--sm" onClick={() => { setTileFailed(false); setTilesKey((key) => key + 1); }} type="button">{t('sheetAnalytics.mapRetry', 'Try again')}</button>
        </div>
      )}
      {chosen && <PlaceCard detailsHref={detailsHref} onClose={() => setSelected(null)} place={chosen} sessionPath={sessionPath} t={t} />}
      <div aria-hidden="true" style={{ ...muted, alignItems: 'center', display: 'flex', flexWrap: 'wrap', fontSize: 12, gap: 12 }}>
        {(['good', 'mid', 'bad'] as const).map((band) => (
          <span key={band} style={{ alignItems: 'center', display: 'inline-flex', gap: 4 }}>
            <span style={{ background: rateColor(band === 'good' ? 90 : band === 'mid' ? 70 : 10), borderRadius: '50%', display: 'inline-block', height: 10, width: 10 }} />
            {band === 'good' ? t('sheetAnalytics.bandGood', 'Good result') : band === 'mid' ? t('sheetAnalytics.bandMid', 'With remarks') : t('sheetAnalytics.bandBad', 'Bad result')}
          </span>
        ))}
      </div>
      <table style={{ border: 0, clip: 'rect(0 0 0 0)', height: 1, margin: -1, overflow: 'hidden', padding: 0, position: 'absolute', whiteSpace: 'nowrap', width: 1 }}>
        <caption>{t('sheetAnalytics.mapTitle', 'Check map')}</caption>
        <thead><tr><th>{t('sheetAnalytics.sliceDate', 'Date')}</th><th>{t('sheetAnalytics.colSheet', 'Checklist')}</th><th>{t('sheetAnalytics.sliceEmployee', 'Employee')}</th><th>{t('sheetAnalytics.mapResult', 'Result')}</th><th>{t('sheetAnalytics.mapCoordinates', 'Coordinates')}</th></tr></thead>
        <tbody>
          {places.slice(0, TEXT_LIST).map((place) => (
            <tr key={place.sessionId}><td>{new Date(place.at).toLocaleString()}</td><td>{plainText(place.checklistTitle)}</td><td>{place.employee}</td><td>{resultText(place, t)}</td><td>{place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MapBody({ query, widget, detailsHref, sessionPath, t }: { query: Omit<SheetAnalyticsQuery, 'groupByField'>; widget: AnalyticsWidget; detailsHref: (checklistId: string) => string; sessionPath?: (sessionId: string) => string; t: Translate }) {
  const loadError = t('sheetAnalytics.mapLoadError', 'Unable to load the map.');
  const key = JSON.stringify(query);
  const { state, reload } = useAsyncData(() => getSheetAnalyticsPlaces(query), [key], { unauthenticated: loadError, error: loadError });
  if (state.status === 'loading') return <span style={muted}>{t('sheetAnalytics.mapLoading', 'Loading the map…')}</span>;
  if (state.status !== 'loaded') {
    return (
      <div role="alert" style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <span>{loadError}</span>
        <button className="ds-button ds-button--secondary ds-button--sm" onClick={() => void reload()} type="button">{t('sheetAnalytics.mapRetry', 'Try again')}</button>
      </div>
    );
  }
  const { items, total, withoutPlace, truncated } = state.data;
  if (items.length === 0) {
    return (
      <span style={muted}>
        {t('sheetAnalytics.mapEmpty', 'No checks with a place in this period. To see checks here, turn on "Geolocation" in the settings of the checklist; the place is saved only if the person allows it in the browser.')}
        {withoutPlace > 0 ? ` ${t('sheetAnalytics.mapWithoutPlace', '{{count}} finished checks have no place.', { count: withoutPlace })}` : ''}
      </span>
    );
  }
  return (
    <>
      <MapCanvas density={optionValue(widget, 'view') === 'density'} detailsHref={detailsHref} key={key + total} places={items} sessionPath={sessionPath} t={t} />
      <span style={{ ...muted, fontSize: 12 }}>
        {t('sheetAnalytics.mapSummary', '{{shown}} of {{all}} finished checks have a place.', { shown: items.length, all: items.length + withoutPlace })}
        {truncated ? ` ${t('sheetAnalytics.mapTruncated', 'Only the newest points are shown; narrow the period or filters.')}` : ''}
        {' '}{t('sheetAnalytics.mapPrivacy', 'The map background is loaded from OpenStreetMap: its server sees which area is open, not the coordinates of the checks.')}
      </span>
    </>
  );
}
