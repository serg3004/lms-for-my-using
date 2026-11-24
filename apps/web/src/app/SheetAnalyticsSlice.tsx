import { plainText } from '@lms/shared/rich-text';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { getSheetAnalyticsSlice, type SheetAnalyticsSliceQuery, type SheetAnalyticsSliceRow } from '../shared/api/manager.js';
import { DataTable, PageState, type Column } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { rateColor } from './SheetAnalyticsDashboard.js';

/** PR 520: the finished results behind a pie sector or a heat map cell, with the filters of the dashboard. */

const BAND_LABELS = { good: ['sheetAnalytics.bandGood', 'Good result'], mid: ['sheetAnalytics.bandMid', 'With remarks'], bad: ['sheetAnalytics.bandBad', 'Bad result'] } as const;
const DAY_KEYS = ['dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat', 'daySun'] as const;
const DAY_FALLBACK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function SheetAnalyticsSlice({ query, sessionPath, detailsHref }: { query: SheetAnalyticsSliceQuery; sessionPath?: (sessionId: string) => string; detailsHref: (checklistId: string) => string }) {
  const { t: translate } = useTranslation();
  const t = translate as unknown as (key: string, fallback: string, options?: Record<string, unknown>) => string;
  const loadError = t('sheetAnalytics.loadError', 'Unable to load analytics.');
  const key = JSON.stringify(query);
  const { state } = useAsyncData(() => getSheetAnalyticsSlice(query), [key], { unauthenticated: loadError, error: loadError });
  const title = query.result
    ? t(BAND_LABELS[query.result][0], BAND_LABELS[query.result][1])
    : `${t(`sheetAnalytics.${DAY_KEYS[query.weekday ?? 0]}`, DAY_FALLBACK[query.weekday ?? 0]!)}, ${(query.block ?? 0) * 2}:00–${((query.block ?? 0) + 1) * 2}:00`;

  const columns: Column<SheetAnalyticsSliceRow>[] = [
    { key: 'at', label: t('sheetAnalytics.sliceDate', 'Date'), priority: 'primary', render: (row) => new Date(row.at).toLocaleString() },
    { key: 'sheet', label: t('sheetAnalytics.colSheet', 'Checklist'), priority: 'primary', render: (row) => <Link to={detailsHref(row.checklistId)}>{plainText(row.checklistTitle)}</Link> },
    { key: 'employee', label: t('sheetAnalytics.sliceEmployee', 'Employee'), priority: 'primary', render: (row) => row.employee || '—' },
    { key: 'department', label: t('sheetAnalytics.sliceDepartment', 'Department'), priority: 'tertiary', render: (row) => row.department ?? '—' },
    { key: 'result', label: t('sheetAnalytics.sliceResult', 'Result'), priority: 'primary', align: 'end', render: (row) => (row.percentage === null ? '—' : <strong style={{ color: rateColor(row.percentage) }}>{row.percentage}%</strong>) },
    { key: 'open', label: '', priority: 'secondary', align: 'end', render: (row) => (row.sessionId && sessionPath ? <Link to={sessionPath(row.sessionId)}>{t('sheetAnalytics.sliceOpen', 'Open')}</Link> : null) },
  ];

  return (
    <section aria-label={title} data-testid="sheet-analytics-slice" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ fontSize: 22, margin: 0 }}>{title}</h2>
      {state.status === 'loading' && <PageState message={t('sheetAnalytics.loading', 'Loading...')} variant="loading" />}
      {(state.status === 'error' || state.status === 'unauthenticated' || state.status === 'notFound') && <PageState message={state.message} variant="error" />}
      {state.status === 'loaded' && (
        <>
          <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>{t('sheetAnalytics.sliceTotal', 'Results found: {{count}}', { count: state.data.total })}{state.data.total > state.data.items.length ? ` · ${t('sheetAnalytics.sliceNewest', 'the newest {{count}} are shown', { count: state.data.items.length })}` : ''}</p>
          <DataTable<SheetAnalyticsSliceRow> columns={columns} emptyMessage={t('sheetAnalytics.sliceEmpty', 'No results for these filters.')} responsiveDetails={{ label: t('courses.details', 'Details'), expandLabel: (row) => `${t('courses.details', 'Details')}: ${row.employee}`, collapseLabel: (row) => `${t('courses.details', 'Details')}: ${row.employee}` }} keyExtractor={(row) => `${row.sessionId ?? row.checklistId}:${row.at}:${row.employee}`} label={title} rows={state.data.items} />
        </>
      )}
    </section>
  );
}
