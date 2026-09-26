import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { listChecklists } from '../shared/api/checklists.js';
import { listChecklistSessions } from '../shared/api/checklistSessions.js';
import { formatDate } from '../shared/formatDate.js';
import { describeChecklistSessionResult } from '../shared/checklistStatus.js';
import {
  getManagerChecklistAnalytics,
  type ManagerChecklistAnalytics,
  type ManagerChecklistAnalyticsEmployeeRow,
} from '../shared/api/manager.js';
import type { ChecklistSessionSummary, ChecklistSummary } from '../shared/api/types.js';
import { ManagerPageLayout } from '../shared/managerLayout.js';
import { Card, DataTable, PageState, StatCard, StatsGrid, type Column } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = { week: 7, month: 30, quarter: 90 } as const;
type Period = keyof typeof PERIOD_DAYS | 'custom';

const COLORS = { low: '#dc2626', mid: '#d97706', high: '#0f9f6e', line: '#4f46e5', text: '#172033', muted: '#6b7280', border: '#e3e8ef' };
const TREND_ARROW: Record<NonNullable<ManagerChecklistAnalyticsEmployeeRow['trend']>, string> = { up: '▲', down: '▼', flat: '▬' };

/** Exported for unit tests: resolves the period selector + optional custom bounds into an ISO `{from,to}` pair. */
export function resolvePeriodRange(period: Period, now: Date, customFrom: string, customTo: string): { from: string; to: string } {
  if (period === 'custom' && customFrom && customTo) return { from: new Date(customFrom).toISOString(), to: new Date(customTo).toISOString() };
  const days = period === 'custom' ? PERIOD_DAYS.month : PERIOD_DAYS[period];
  return { from: new Date(now.getTime() - days * DAY_MS).toISOString(), to: now.toISOString() };
}

function employeeName(row: { firstName: string; lastName: string }) {
  return [row.firstName, row.lastName].filter(Boolean).join(' ');
}

export function DistributionDonut({ distribution, t }: { distribution: ManagerChecklistAnalytics['distribution']; t: (key: string, fallback: string) => string }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const total = distribution.reduce((sum, bucket) => sum + bucket.count, 0);
  const labels: Record<string, string> = {
    low: t('manager.checklists.bucketLow', 'Low'),
    mid: t('manager.checklists.bucketMid', 'Mid'),
    high: t('manager.checklists.bucketHigh', 'High'),
  };
  const colorOf: Record<string, string> = { low: COLORS.low, mid: COLORS.mid, high: COLORS.high };

  let cumulative = 0;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const arcs = distribution.map((bucket) => {
    const fraction = total > 0 ? bucket.count / total : 0;
    const dash = fraction * circumference;
    const arc = { ...bucket, dash, offset: cumulative };
    cumulative += dash;
    return arc;
  });

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, color: COLORS.text }}>{t('manager.checklists.distributionTitle', 'Result distribution')}</h2>
        <button type="button" className="ds-button ds-button--ghost" onClick={() => setView(view === 'chart' ? 'table' : 'chart')}>
          {view === 'chart' ? t('manager.checklists.viewAsTable', 'View as table') : t('manager.checklists.viewAsChart', 'View as chart')}
        </button>
      </div>
      {view === 'chart' ? (
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={t('manager.checklists.distributionTitle', 'Result distribution')}>
            <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--color-border, #e3e8ef)" strokeWidth="16" />
            {arcs.map((arc) => (
              <circle
                key={arc.bucket}
                cx="70" cy="70" r={radius} fill="none"
                stroke={colorOf[arc.bucket]}
                strokeWidth="16"
                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                strokeDashoffset={-arc.offset}
                strokeLinecap="butt"
                transform="rotate(-90 70 70)"
              />
            ))}
            <text x="70" y="75" textAnchor="middle" fontSize="20" fontWeight="700" fill={COLORS.text}>{total}</text>
          </svg>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {distribution.map((bucket) => (
              <li key={bucket.bucket} style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.text }}>
                <span aria-hidden style={{ width: 12, height: 12, borderRadius: 4, background: colorOf[bucket.bucket], display: 'inline-block' }} />
                <span>{labels[bucket.bucket]}: <strong>{bucket.count}</strong></span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <caption className="ui-visually-hidden">{t('manager.checklists.distributionTitle', 'Result distribution')}</caption>
          <thead><tr><th scope="col">{t('manager.checklists.bucket', 'Bucket')}</th><th scope="col">{t('manager.checklists.count', 'Count')}</th></tr></thead>
          <tbody>
            {distribution.map((bucket) => <tr key={bucket.bucket}><td>{labels[bucket.bucket]}</td><td>{bucket.count}</td></tr>)}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function TrendLine({ trend, t }: { trend: ManagerChecklistAnalytics['trend']; t: (key: string, fallback: string) => string }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const width = 480;
  const height = 160;
  const padding = 24;

  const points = trend.map((point, index) => {
    const x = trend.length > 1 ? padding + (index / (trend.length - 1)) * (width - padding * 2) : width / 2;
    const y = height - padding - (point.averagePercentage / 100) * (height - padding * 2);
    return { ...point, x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, color: COLORS.text }}>{t('manager.checklists.trendTitle', 'Average score trend')}</h2>
        <button type="button" className="ds-button ds-button--ghost" onClick={() => setView(view === 'chart' ? 'table' : 'chart')}>
          {view === 'chart' ? t('manager.checklists.viewAsTable', 'View as table') : t('manager.checklists.viewAsChart', 'View as chart')}
        </button>
      </div>
      {trend.length === 0 ? (
        <PageState message={t('manager.checklists.trendEmpty', 'No completed sessions in this period yet.')} />
      ) : view === 'chart' ? (
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('manager.checklists.trendTitle', 'Average score trend')}>
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--color-border, #e3e8ef)" strokeWidth="1" />
          <path d={path} fill="none" stroke={COLORS.line} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point) => <circle key={point.date} cx={point.x} cy={point.y} r="4" fill={COLORS.line} />)}
        </svg>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <caption className="ui-visually-hidden">{t('manager.checklists.trendTitle', 'Average score trend')}</caption>
          <thead><tr><th scope="col">{t('manager.checklists.date', 'Date')}</th><th scope="col">{t('manager.checklists.average', 'Average')}</th><th scope="col">{t('manager.checklists.count', 'Count')}</th></tr></thead>
          <tbody>
            {trend.map((point) => <tr key={point.date}><td>{point.date}</td><td>{point.averagePercentage}%</td><td>{point.count}</td></tr>)}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function EmployeeSessionsDrilldown({ userId, from, to, t }: { userId: string; from: string; to: string; t: (key: string, fallback: string) => string }) {
  const { state } = useAsyncData<ChecklistSessionSummary[]>(
    async () => (await listChecklistSessions({ learnerId: userId, scheduledFrom: from, scheduledTo: to, pageSize: 50 })).items,
    [userId, from, to],
    { unauthenticated: t('manager.checklists.loadError', 'Unable to load analytics.'), error: t('manager.checklists.loadError', 'Unable to load analytics.') },
  );

  if (state.status === 'loading') return <PageState message={t('manager.checklists.loading', 'Loading...')} variant="loading" />;
  if (state.status !== 'loaded') return <PageState message={state.message} variant="error" />;
  if (state.data.length === 0) return <PageState message={t('manager.checklists.employeeSessionsEmpty', 'No sessions for this employee in the selected period.')} />;

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
      {state.data.map((session) => (
        <li key={session.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: `1px solid ${COLORS.border}` }}>
          <span>{session.checklist.title}</span>
          {/* PR 303: rendered in the session's own timezone -- see AdminChecklistSessionsPage's list column for why. */}
          <span style={{ color: COLORS.muted }}>{session.scheduledAt ? formatDate(session.scheduledAt, undefined, { dateStyle: 'medium', timeZone: session.timezone }) : '—'}</span>
          <span>
            {(() => {
              if (!session.result.visible) return '—';
              const result = describeChecklistSessionResult(session.result);
              if (result.kind === 'scored') return `${result.percentage}%`;
              if (result.kind === 'notScored') return t('manager.checklists.notScored', 'Not scored (all skipped)');
              return '—';
            })()}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ManagerChecklistsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const period = (searchParams.get('period') as Period | null) ?? 'month';
  const checklistId = searchParams.get('checklistId') ?? '';
  const customFrom = searchParams.get('from') ?? '';
  const customTo = searchParams.get('to') ?? '';
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const { from, to } = useMemo(() => resolvePeriodRange(period, new Date(), customFrom, customTo), [period, customFrom, customTo]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  const { state } = useAsyncData<ManagerChecklistAnalytics>(
    () => getManagerChecklistAnalytics({ from, to, checklistId: checklistId || undefined }),
    [from, to, checklistId],
    { unauthenticated: t('manager.checklists.loadError', 'Unable to load analytics.'), error: t('manager.checklists.loadError', 'Unable to load analytics.') },
  );
  const { state: checklistsState } = useAsyncData<ChecklistSummary[]>(listChecklists, [], { unauthenticated: '', error: '' });
  const checklists = checklistsState.status === 'loaded' ? checklistsState.data : [];

  const columns: Column<ManagerChecklistAnalyticsEmployeeRow>[] = [
    { key: 'employee', label: t('manager.checklists.employee', 'Employee'), priority: 'primary', render: employeeName },
    { key: 'department', label: t('manager.checklists.department', 'Department'), priority: 'secondary', render: (row) => row.department ?? '—' },
    { key: 'sessions', label: t('manager.checklists.sessions', 'Sessions'), priority: 'secondary', render: (row) => row.sessionsCount },
    { key: 'average', label: t('manager.checklists.average', 'Average'), priority: 'primary', render: (row) => (row.averagePercentage === null ? '—' : `${row.averagePercentage}%`) },
    { key: 'trend', label: t('manager.checklists.trend', 'Trend'), priority: 'secondary', render: (row) => (row.trend ? <span aria-label={t(`manager.checklists.trend.${row.trend}`, row.trend)}>{TREND_ARROW[row.trend]}</span> : '—') },
  ];

  return (
    <ManagerPageLayout currentPath="/manager/checklists">
      <header style={{ marginBottom: 20 }}>
        <div style={{ color: 'var(--color-primary)', fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>{t('manager.checklists.eyebrow', 'Workplace training')}</div>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px,4vw,36px)' }}>{t('manager.checklists.title', 'Checklist analytics')}</h1>
        <p style={{ margin: '8px 0 0', color: 'var(--color-text-muted)' }}>{t('manager.checklists.subtitle', 'How your team is performing on workplace-training checklists.')}</p>
      </header>

      <Card style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))', gap: 16, marginBottom: 20 }}>
        <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>
          {t('manager.checklists.periodFilter', 'Period')}
          <select className="ds-input" value={period} onChange={(event) => updateParam('period', event.target.value)}>
            <option value="week">{t('manager.checklists.periodWeek', 'Week')}</option>
            <option value="month">{t('manager.checklists.periodMonth', 'Month')}</option>
            <option value="quarter">{t('manager.checklists.periodQuarter', 'Quarter')}</option>
            <option value="custom">{t('manager.checklists.periodCustom', 'Custom')}</option>
          </select>
        </label>
        {period === 'custom' && (
          <>
            <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>
              {t('manager.checklists.from', 'From')}
              <input className="ds-input" type="date" value={customFrom} onChange={(event) => updateParam('from', event.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>
              {t('manager.checklists.to', 'To')}
              <input className="ds-input" type="date" value={customTo} onChange={(event) => updateParam('to', event.target.value)} />
            </label>
          </>
        )}
        <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>
          {t('manager.checklists.checklistFilter', 'Checklist')}
          <select className="ds-input" value={checklistId} onChange={(event) => updateParam('checklistId', event.target.value)}>
            <option value="">{t('manager.checklists.allChecklists', 'All checklists')}</option>
            {checklists.map((checklist) => <option key={checklist.id} value={checklist.id}>{checklist.title}</option>)}
          </select>
        </label>
      </Card>

      {state.status === 'loading' && <PageState message={t('manager.checklists.loading', 'Loading...')} variant="loading" />}
      {(state.status === 'unauthenticated' || state.status === 'notFound' || state.status === 'error') && (
        <PageState title={t('manager.checklists.title', 'Checklist analytics')} message={state.message} variant="error" />
      )}
      {state.status === 'loaded' && (
        <>
          <StatsGrid>
            <StatCard label={t('manager.checklists.totalSessions', 'Sessions')} value={state.data.summary.totalSessions} />
            <StatCard label={t('manager.checklists.completedSessions', 'Completed')} value={state.data.summary.completedSessions} />
            <StatCard label={t('manager.checklists.averageScore', 'Average score')} value={`${state.data.summary.averagePercentage}%`} />
            <StatCard label={t('manager.checklists.highPerformers', 'High performers')} value={state.data.summary.highCount} />
            <StatCard label={t('manager.checklists.lowPerformers', 'Low performers')} value={state.data.summary.lowCount} />
            <StatCard label={t('manager.checklists.noCompletion', 'No completion')} value={state.data.summary.noCompletionCount} />
          </StatsGrid>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: 16, margin: '20px 0' }}>
            <DistributionDonut distribution={state.data.distribution} t={t} />
            <TrendLine trend={state.data.trend} t={t} />
          </div>

          <DataTable
            columns={columns}
            density="dense"
            emptyMessage={t('manager.checklists.employeesEmpty', 'No employees in scope for this period.')}
            keyExtractor={(row) => row.userId}
            label={t('manager.checklists.employeesTableLabel', 'Employees')}
            responsiveDetails={{ label: t('courses.details'), expandLabel: (row) => `${t('courses.details')}: ${employeeName(row)}`, collapseLabel: (row) => `${t('courses.details')}: ${employeeName(row)}` }}
            rows={state.data.employees}
            expansion={{
              expandedKeys,
              onChange: setExpandedKeys,
              render: (row) => <EmployeeSessionsDrilldown userId={row.userId} from={from} to={to} t={t} />,
              expandLabel: (row) => t('manager.checklists.expand', 'View sessions') + ` — ${employeeName(row)}`,
              collapseLabel: (row) => t('manager.checklists.collapse', 'Hide sessions') + ` — ${employeeName(row)}`,
            }}
          />
        </>
      )}
    </ManagerPageLayout>
  );
}
