import { plainText } from '@lms/shared/rich-text';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { SheetAnalyticsSummary } from '../shared/api/manager.js';
import { Card } from '../shared/ui.js';

/** PR 519: the cards of the dashboard (trend, completion by department, weakest criteria); they only draw what the server counted. */

const hidden = { border: 0, clip: 'rect(0 0 0 0)', height: 1, margin: -1, overflow: 'hidden', padding: 0, position: 'absolute', whiteSpace: 'nowrap', width: 1 } as const;

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

export function TrendCard({ trend }: { trend: SheetAnalyticsSummary['trend'] }) {
  const { t } = useTranslation();
  const title = t('sheetAnalytics.trendTitle', 'Completion over time');
  const points = trend.filter((row) => row.averagePercentage !== null);
  const width = 520;
  const height = 150;
  const left = 34;
  const x = (index: number) => (points.length === 1 ? left + (width - left - 10) / 2 : left + (index * (width - left - 10)) / Math.max(1, points.length - 1));
  const y = (value: number) => 10 + (height - 34) * (1 - value / 100);
  const line = points.map((row, index) => `${x(index)},${y(row.averagePercentage ?? 0)}`).join(' ');
  return (
    <Card style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
      {points.length === 0 ? <span style={{ color: 'var(--color-text-muted)' }}>{t('sheetAnalytics.noTrend', 'No finished sessions in this period yet.')}</span> : (
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
      )}
    </Card>
  );
}

function Bar({ label, value, color, hint }: { label: string; value: number | null; color: string; hint?: string }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{label}{hint ? <span style={{ color: 'var(--color-text-muted)' }}> · {hint}</span> : null}</span>
        <strong>{value === null ? '—' : `${value}%`}</strong>
      </div>
      <div aria-hidden="true" style={{ background: 'var(--color-border)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ background: color, height: '100%', width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

export function DepartmentsCard({ departments, onPick }: { departments: SheetAnalyticsSummary['departments']; onPick: (id: string) => void }) {
  const { t } = useTranslation();
  const title = t('sheetAnalytics.departmentsTitle', 'Completion by department');
  return (
    <Card style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
      {departments.length === 0 ? <span style={{ color: 'var(--color-text-muted)' }}>{t('sheetAnalytics.noDepartments', 'No sessions by department yet.')}</span> : departments.map((row) => {
        const name = row.name ?? t('sheetAnalytics.noDepartment', 'No department');
        const bar = <Bar color={rateColor(row.completionPercentage)} hint={`${row.completed} / ${row.planned}`} label={name} value={row.completionPercentage} />;
        return row.id
          ? <button aria-label={`${t('sheetAnalytics.onlyDepartment', 'Show only')}: ${name}`} key={row.id} onClick={() => onPick(row.id!)} style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', font: 'inherit', padding: 0, textAlign: 'left' }} type="button">{bar}</button>
          : <div key="none">{bar}</div>;
      })}
    </Card>
  );
}

export function WeakCard({ weak, detailsHref, sheetTitles }: { weak: SheetAnalyticsSummary['weak']; detailsHref: (checklistId: string) => string; sheetTitles: ReadonlyMap<string, string> }) {
  const { t } = useTranslation();
  const title = t('sheetAnalytics.weakTitle', 'Weak spots');
  return (
    <Card style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
      {weak.length === 0 ? <span style={{ color: 'var(--color-text-muted)' }}>{t('sheetAnalytics.noWeak', 'Not enough answers yet: a criterion appears here after three scored answers.')}</span> : (
        <>
          {weak.map((row) => (
            <Link key={`${row.checklistId}:${row.id}`} style={{ color: 'inherit', textDecoration: 'none' }} to={detailsHref(row.checklistId)}>
              <Bar color={rateColor(row.percentage)} hint={plainText(sheetTitles.get(row.checklistId) ?? '') || undefined} label={plainText(row.text)} value={row.percentage} />
            </Link>
          ))}
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }}>{t('sheetAnalytics.weakNote', 'Criteria with the lowest score in the period. Press one to see where and by whom.')}</p>
        </>
      )}
    </Card>
  );
}
