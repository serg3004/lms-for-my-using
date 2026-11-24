import { plainText } from '@lms/shared/rich-text';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { AnalyticsWidgetId, SheetAnalytics, SheetAnalyticsSummary } from '../shared/api/manager.js';
import { StatCard, StatsGrid } from '../shared/ui.js';
import { figureChange } from './SheetAnalyticsLayout.js';
import { percent, ScaleLevelBars } from './SheetAnalyticsParts.js';

/** PR 519/520: the bodies of the dashboard widgets; they only draw what the server counted. */

const hidden = { border: 0, clip: 'rect(0 0 0 0)', height: 1, margin: -1, overflow: 'hidden', padding: 0, position: 'absolute', whiteSpace: 'nowrap', width: 1 } as const;
const muted = { color: 'var(--color-text-muted)' } as const;
const plainButton = { background: 'none', border: 0, color: 'inherit', cursor: 'pointer', font: 'inherit', padding: 0, textAlign: 'left', width: '100%' } as const;

/** Exported for tests: green from 80, amber from 60, red below. */
export function rateColor(value: number | null): string {
  if (value === null) return 'var(--color-text-subtle)';
  return value >= 80 ? 'var(--color-success)' : value >= 60 ? 'var(--color-warning)' : 'var(--color-danger)';
}

/** Exported for tests: "02.11" from an ISO date of a week's Monday. */
export function weekLabel(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return `${day}.${month}`;
}

/** Exported for tests: heat map cell strength, 0-100, against the busiest cell. */
export function heatStrength(count: number, max: number): number {
  return max > 0 ? Math.round((count / max) * 100) : 0;
}

type Translate = (key: string, fallback: string, options?: Record<string, unknown>) => string;

function Empty({ children }: { children: ReactNode }) {
  return <span style={muted}>{children}</span>;
}

function Bar({ label, value, color, hint }: { label: string; value: number | null; color: string; hint?: string }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{label}{hint ? <span style={muted}> · {hint}</span> : null}</span>
        <strong>{value === null ? '—' : `${value}%`}</strong>
      </div>
      <div aria-hidden="true" style={{ background: 'var(--color-border)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ background: color, height: '100%', width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

function changeText(t: Translate, change: ReturnType<typeof figureChange>, unit: 'pp' | 'pcs' | 'score'): string | null {
  if (!change) return null;
  const arrow = change.delta === 0 ? '=' : change.delta > 0 ? '▲' : '▼';
  const amount = unit === 'pp' ? `${Math.abs(change.delta)} ${t('sheetAnalytics.points', 'p.p.')}` : String(Math.abs(change.delta));
  return `${arrow} ${amount} ${t('sheetAnalytics.vsPrevious', 'vs previous period')}`;
}

function Delta({ text, good }: { text: string | null; good: boolean }) {
  return text ? <span style={{ color: good ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600 }}>{text}</span> : null;
}

function KpiBody({ data, t }: { data: SheetAnalytics; t: Translate }) {
  const { plan, criteria, queue } = data.total;
  const previous = data.summary?.previous;
  const completionChange = figureChange(data.total.completionPercentage, previous?.completionPercentage, true);
  const averageChange = figureChange(data.total.averagePercentage, previous?.averagePercentage, true);
  const doneChange = figureChange(plan.completed, previous?.completed, true);
  const overdueChange = figureChange(plan.overdue, previous?.overdue, false);
  const guests = data.total.guests?.completed ?? 0;
  const facts = [
    `${t('sheetAnalytics.answered', 'Answered')}: ${criteria.answered} · ${t('sheetAnalytics.remaining', 'Left')}: ${criteria.remaining}`,
    `${t('sheetAnalytics.queue', 'Not started')}: ${queue.notStarted}${queue.oldestDays === null ? '' : ` (${t('sheetAnalytics.oldest', 'Oldest: {{days}} d').replace('{{days}}', String(queue.oldestDays))})`}`,
    ...(guests > 0 ? [`${t('sheetAnalytics.guests', 'Guests (link or QR)')}: ${guests} · ${t('sheetAnalytics.average', 'Average score')}: ${percent(data.total.guests?.averagePercentage ?? null)}`] : []),
  ];
  return (
    <>
      <StatsGrid>
        <StatCard label={t('sheetAnalytics.completion', 'Completion')} value={percent(data.total.completionPercentage)} trend={<>{`${plan.completed} / ${plan.planned}`} <Delta good={completionChange?.good ?? true} text={changeText(t, completionChange, 'pp')} /></>} />
        <StatCard label={t('sheetAnalytics.average', 'Average score')} value={percent(data.total.averagePercentage)} trend={<Delta good={averageChange?.good ?? true} text={changeText(t, averageChange, 'pp')} />} />
        <StatCard label={t('sheetAnalytics.colFact', 'Done')} value={plan.completed} trend={<Delta good={doneChange?.good ?? true} text={changeText(t, doneChange, 'pcs')} />} />
        <StatCard label={t('sheetAnalytics.overdue', 'Overdue')} value={plan.overdue} trend={<Delta good={overdueChange?.good ?? true} text={changeText(t, overdueChange, 'pcs')} />} />
      </StatsGrid>
      <p style={{ ...muted, fontSize: 13, margin: 0 }}>{facts.join(' · ')}</p>
    </>
  );
}

function LevelsBody({ data, t }: { data: SheetAnalytics; t: Translate }) {
  if (data.total.scales.length === 0) return <Empty>{t('sheetAnalytics.noLevels', 'No scored answers in this period yet.')}</Empty>;
  return <div style={{ display: 'grid', gap: 20 }}>{data.total.scales.map((scale) => <ScaleLevelBars key={scale.scaleKey} scale={scale} t={t} />)}</div>;
}

function TrendBody({ trend, t }: { trend: SheetAnalyticsSummary['trend']; t: Translate }) {
  const title = t('sheetAnalytics.trendTitle', 'Completion over time');
  const points = trend.filter((row) => row.averagePercentage !== null);
  if (points.length === 0) return <Empty>{t('sheetAnalytics.noTrend', 'No finished sessions in this period yet.')}</Empty>;
  const width = 520;
  const height = 150;
  const left = 34;
  const x = (index: number) => (points.length === 1 ? left + (width - left - 10) / 2 : left + (index * (width - left - 10)) / Math.max(1, points.length - 1));
  const y = (value: number) => 10 + (height - 34) * (1 - value / 100);
  const line = points.map((row, index) => `${x(index)},${y(row.averagePercentage ?? 0)}`).join(' ');
  return (
    <>
      <svg aria-label={`${title}: ${points.map((row) => `${weekLabel(row.weekStart)} ${row.averagePercentage}%`).join(', ')}`} role="img" style={{ width: '100%', height: 'auto' }} viewBox={`0 0 ${width} ${height}`}>
        {[0, 50, 100].map((mark) => (
          <g key={mark}>
            <line stroke="var(--color-border)" x1={left} x2={width - 10} y1={y(mark)} y2={y(mark)} />
            <text fill="var(--color-text-muted)" fontSize="11" x={0} y={y(mark) + 4}>{mark}%</text>
          </g>
        ))}
        {points.length > 1 && <polyline fill="none" points={line} stroke="var(--color-primary)" strokeLinejoin="round" strokeWidth="2.5" />}
        {points.map((row, index) => <circle cx={x(index)} cy={y(row.averagePercentage ?? 0)} fill="var(--color-primary)" key={row.weekStart} r="4"><title>{`${weekLabel(row.weekStart)}: ${row.averagePercentage}%`}</title></circle>)}
        <text fill="var(--color-text-muted)" fontSize="11" x={left} y={height - 6}>{weekLabel(points[0]!.weekStart)}</text>
        <text fill="var(--color-text-muted)" fontSize="11" textAnchor="end" x={width - 10} y={height - 6}>{weekLabel(points[points.length - 1]!.weekStart)}</text>
      </svg>
      <table style={hidden}>
        <caption>{title}</caption>
        <thead><tr><th>{t('sheetAnalytics.week', 'Week of')}</th><th>{t('sheetAnalytics.fact', 'Done')}</th><th>{t('sheetAnalytics.average', 'Average score')}</th></tr></thead>
        <tbody>{trend.map((row) => <tr key={row.weekStart}><td>{weekLabel(row.weekStart)}</td><td>{row.completed}</td><td>{row.averagePercentage ?? '—'}</td></tr>)}</tbody>
      </table>
    </>
  );
}

function DepartmentsBody({ departments, onPick, t }: { departments: SheetAnalyticsSummary['departments']; onPick: (id: string) => void; t: Translate }) {
  if (departments.length === 0) return <Empty>{t('sheetAnalytics.noDepartments', 'No sessions by department yet.')}</Empty>;
  return (
    <>
      {departments.map((row) => {
        const name = row.name ?? t('sheetAnalytics.noDepartment', 'No department');
        const bar = <Bar color={rateColor(row.completionPercentage)} hint={`${row.completed} / ${row.planned}`} label={name} value={row.completionPercentage} />;
        return row.id
          ? <button aria-label={`${t('sheetAnalytics.onlyDepartment', 'Show only')}: ${name}`} key={row.id} onClick={() => onPick(row.id!)} style={plainButton} type="button">{bar}</button>
          : <div key="none">{bar}</div>;
      })}
    </>
  );
}

function WeakBody({ weak, detailsHref, sheetTitles, t }: { weak: SheetAnalyticsSummary['weak']; detailsHref: (checklistId: string) => string; sheetTitles: ReadonlyMap<string, string>; t: Translate }) {
  if (weak.length === 0) return <Empty>{t('sheetAnalytics.noWeak', 'Not enough answers yet: a criterion appears here after three scored answers.')}</Empty>;
  return (
    <>
      {weak.map((row) => (
        <Link key={`${row.checklistId}:${row.id}`} style={{ color: 'inherit', textDecoration: 'none' }} to={detailsHref(row.checklistId)}>
          <Bar color={rateColor(row.percentage)} hint={plainText(sheetTitles.get(row.checklistId) ?? '') || undefined} label={plainText(row.text)} value={row.percentage} />
        </Link>
      ))}
      <p style={{ ...muted, fontSize: 13, margin: 0 }}>{t('sheetAnalytics.weakNote', 'Criteria with the lowest score in the period. Press one to see where and by whom.')}</p>
    </>
  );
}

const BANDS = [
  { key: 'good', color: 'var(--color-success)', label: ['sheetAnalytics.bandGood', 'Good result'] },
  { key: 'mid', color: 'var(--color-warning)', label: ['sheetAnalytics.bandMid', 'With remarks'] },
  { key: 'bad', color: 'var(--color-danger)', label: ['sheetAnalytics.bandBad', 'Bad result'] },
] as const;

function DonutBody({ results, t }: { results: NonNullable<SheetAnalyticsSummary['results']>; t: Translate }) {
  const total = results.good + results.mid + results.bad;
  if (total === 0) return <Empty>{t('sheetAnalytics.noResults', 'No scored results in this period yet.')}</Empty>;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const rows = BANDS.map((band) => ({ ...band, count: results[band.key], share: Math.round((results[band.key] / total) * 100), name: t(band.label[0], band.label[1]) }));
  let offset = 0;
  return (
    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
      <svg aria-label={`${t('sheetAnalytics.donutTitle', 'Check results')}: ${rows.map((row) => `${row.name} ${row.share}%`).join(', ')}`} height="150" role="img" viewBox="0 0 140 140" width="150">
        <circle cx="70" cy="70" fill="none" r={radius} stroke="var(--color-border)" strokeWidth="22" />
        {rows.map((row) => {
          const length = (circumference * row.count) / total;
          const arc = <circle cx="70" cy="70" fill="none" key={row.key} r={radius} stroke={row.color} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} strokeWidth="22" transform="rotate(-90 70 70)"><title>{`${row.name}: ${row.count} (${row.share}%)`}</title></circle>;
          offset += length;
          return arc;
        })}
        <text fill="var(--color-text)" fontSize="22" fontWeight="700" textAnchor="middle" x="70" y="68">{total}</text>
        <text fill="var(--color-text-muted)" fontSize="11" textAnchor="middle" x="70" y="86">{t('sheetAnalytics.donutChecks', 'checks')}</text>
      </svg>
      <ul style={{ display: 'grid', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map((row) => (
          <li key={row.key} style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
            <i aria-hidden="true" style={{ background: row.color, borderRadius: '50%', display: 'inline-block', height: 10, width: 10 }} />
            {row.name} <strong>{row.share}%</strong> <span style={muted}>({row.count})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DAY_KEYS = ['dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat', 'daySun'] as const;
const DAY_FALLBACK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function HeatBody({ heat, t }: { heat: number[][]; t: Translate }) {
  const max = Math.max(0, ...heat.flat());
  if (max === 0) return <Empty>{t('sheetAnalytics.noHeat', 'No finished sessions in this period yet.')}</Empty>;
  const blocks = heat[0]?.length ?? 12;
  const span = 24 / blocks;
  const title = t('sheetAnalytics.heatTitle', 'Heat map: weekday and hour');
  const dayName = (index: number) => t(`sheetAnalytics.${DAY_KEYS[index]}`, DAY_FALLBACK[index]!);
  return (
    <>
      <div aria-hidden="true" style={{ alignItems: 'center', color: 'var(--color-text-muted)', display: 'grid', fontSize: 11, gap: 3, gridTemplateColumns: `30px repeat(${blocks}, minmax(0, 1fr))` }}>
        <span />
        {Array.from({ length: blocks }, (_, block) => <span key={block} style={{ textAlign: 'center' }}>{block * span}</span>)}
        {heat.map((row, day) => (
          <div key={day} style={{ display: 'contents' }}>
            <span>{dayName(day)}</span>
            {row.map((count, block) => (
              <span key={block} style={{ aspectRatio: '1.3', background: `color-mix(in srgb, var(--color-primary) ${heatStrength(count, max)}%, var(--color-surface-muted))`, borderRadius: 4 }} title={t('sheetAnalytics.heatCell', '{{day}}, {{from}}:00–{{to}}:00 — {{count}} done', { day: dayName(day), from: block * span, to: (block + 1) * span, count })} />
            ))}
          </div>
        ))}
      </div>
      <div aria-hidden="true" style={{ alignItems: 'center', color: 'var(--color-text-muted)', display: 'flex', fontSize: 12, gap: 8 }}>
        <span>{t('sheetAnalytics.heatLess', 'fewer')}</span>
        <span style={{ background: 'linear-gradient(90deg, var(--color-surface-muted), var(--color-primary))', borderRadius: 4, flex: 1, height: 8 }} />
        <span>{t('sheetAnalytics.heatMore', 'more')}</span>
      </div>
      <table style={hidden}>
        <caption>{title}</caption>
        <thead><tr><th />{Array.from({ length: blocks }, (_, block) => <th key={block}>{`${block * span}:00`}</th>)}</tr></thead>
        <tbody>{heat.map((row, day) => <tr key={day}><th>{dayName(day)}</th>{row.map((count, block) => <td key={block}>{count}</td>)}</tr>)}</tbody>
      </table>
    </>
  );
}

function PeopleBody({ people, onPick, t }: { people: NonNullable<SheetAnalyticsSummary['people']>; onPick: (id: string) => void; t: Translate }) {
  if (people.length === 0) return <Empty>{t('sheetAnalytics.noPeople', 'No scored results in this period yet.')}</Empty>;
  return (
    <ol style={{ display: 'grid', gap: 4, listStyle: 'none', margin: 0, padding: 0 }}>
      {people.map((person, index) => (
        <li key={person.id}>
          <button aria-label={`${t('sheetAnalytics.onlyEmployee', 'Show only')}: ${person.name}`} onClick={() => onPick(person.id)} style={{ ...plainButton, alignItems: 'center', display: 'grid', gap: 10, gridTemplateColumns: '24px minmax(0,1fr) auto', padding: '6px 4px' }} type="button">
            <span aria-hidden="true" style={{ alignItems: 'center', background: 'var(--color-accent-muted)', borderRadius: '50%', color: 'var(--color-primary)', display: 'grid', fontSize: 12, fontWeight: 700, height: 24, placeItems: 'center', width: 24 }}>{index + 1}</span>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{person.name} <span style={muted}>· {t('sheetAnalytics.checksCount', 'checks')} {person.sessions}</span></span>
            <strong style={{ color: rateColor(person.averagePercentage) }}>{person.averagePercentage}%</strong>
          </button>
        </li>
      ))}
    </ol>
  );
}

export type WidgetBodyProps = {
  data: SheetAnalytics;
  t: Translate;
  detailsHref: (checklistId: string) => string;
  sheetTitles: ReadonlyMap<string, string>;
  onPickDepartment: (id: string) => void;
  onPickEmployee: (id: string) => void;
};

/** The body of one widget by its id. */
export function WidgetBody({ id, data, t, detailsHref, sheetTitles, onPickDepartment, onPickEmployee }: WidgetBodyProps & { id: AnalyticsWidgetId }) {
  const summary = data.summary;
  switch (id) {
    case 'kpi': return <KpiBody data={data} t={t} />;
    case 'levels': return <LevelsBody data={data} t={t} />;
    case 'donut': return <DonutBody results={summary?.results ?? { good: 0, mid: 0, bad: 0 }} t={t} />;
    case 'trend': return <TrendBody t={t} trend={summary?.trend ?? []} />;
    case 'depts': return <DepartmentsBody departments={summary?.departments ?? []} onPick={onPickDepartment} t={t} />;
    case 'weak': return <WeakBody detailsHref={detailsHref} sheetTitles={sheetTitles} t={t} weak={summary?.weak ?? []} />;
    case 'heat': return <HeatBody heat={summary?.heat ?? []} t={t} />;
    case 'people': return <PeopleBody onPick={onPickEmployee} people={summary?.people ?? []} t={t} />;
  }
}

export const WIDGET_TITLES: Record<AnalyticsWidgetId, [string, string]> = {
  kpi: ['sheetAnalytics.widgetKpi', 'Key figures'],
  levels: ['sheetAnalytics.levelsTitle', 'Answers by scale level'],
  donut: ['sheetAnalytics.donutTitle', 'Check results'],
  trend: ['sheetAnalytics.trendTitle', 'Completion over time'],
  depts: ['sheetAnalytics.departmentsTitle', 'Completion by department'],
  weak: ['sheetAnalytics.weakTitle', 'Weak spots'],
  heat: ['sheetAnalytics.heatTitle', 'Heat map: weekday and hour'],
  people: ['sheetAnalytics.peopleTitle', 'Employee ranking'],
};
