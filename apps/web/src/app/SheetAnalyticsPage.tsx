import { plainText } from '@lms/shared/rich-text';
import { useMemo, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { AdminPageLayout, ChecklistsTabs } from '../shared/adminPage.js';
import {
  getManagerChecklistAnalytics,
  getSheetAnalytics,
  listSheetAnalyticsSheets,
  type SheetAnalytics,
  type SheetAnalyticsMetrics,
  type SheetAnalyticsSheet,
} from '../shared/api/manager.js';
import { ManagerPageLayout } from '../shared/managerLayout.js';
import { useSession } from '../shared/session.js';
import { ObserverPageLayout } from '../shared/observerLayout.js';
import { Card, DataTable, PageState, StatCard, StatsGrid, type Column } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { percent, ScaleLevelBars } from './SheetAnalyticsParts.js';
import { SheetAnalyticsExport } from './SheetAnalyticsExport.js';
import { SheetItemAnalytics } from './SheetItemAnalytics.js';
import { resolvePeriodRange } from './ManagerChecklistsPage.js';
import { ManagerViewSwitch } from './ManagerViewSwitch.js';
import { ObserverSessionsNav } from './ObserverSessionsNav.js';

/** PR 461: the "Analytics" tab -- metrics over all accessible sheets or the chosen ones. The state lives in the address bar. */

type Period = 'week' | 'month' | 'quarter' | 'custom';
const PERIODS: readonly Period[] = ['week', 'month', 'quarter', 'custom'];

/** Exported for tests: the chosen sheets of the address bar (`sheets=id,id`); an empty list means every accessible sheet. */
export function parseSelectedSheets(value: string | null): string[] {
  return [...new Set((value ?? '').split(',').map((part) => part.trim().toLowerCase()).filter(Boolean))];
}

/** Exported for tests: toggles one sheet; picking every listed sheet is stored as "all" (empty), so the link stays short and follows new sheets. */
export function toggleSheet(selected: readonly string[], id: string, all: readonly string[]): string[] {
  const base = selected.length === 0 ? [...all] : [...selected];
  const next = base.includes(id) ? base.filter((entry) => entry !== id) : [...base, id];
  return next.length === all.length && all.every((entry) => next.includes(entry)) ? [] : next;
}

/** Exported for tests: sheets whose title contains the query, case-insensitively. */
export function filterSheets(sheets: readonly SheetAnalyticsSheet[], query: string): SheetAnalyticsSheet[] {
  const needle = query.trim().toLowerCase();
  return needle ? sheets.filter((sheet) => plainText(sheet.title).toLowerCase().includes(needle)) : [...sheets];
}

export { ScaleLevelBars };

function SummaryCards({ metrics, t }: { metrics: SheetAnalyticsMetrics; t: (key: string, fallback: string) => string }) {
  const { plan, criteria, queue } = metrics;
  return (
    <StatsGrid>
      <StatCard label={t('sheetAnalytics.completion', 'Completion')} value={percent(metrics.completionPercentage)} trend={`${plan.completed} / ${plan.planned}`} />
      <StatCard label={t('sheetAnalytics.average', 'Average score')} value={percent(metrics.averagePercentage)} />
      <StatCard label={t('sheetAnalytics.answered', 'Answered')} value={criteria.answered} trend={`${t('sheetAnalytics.remaining', 'Left')}: ${criteria.remaining}`} />
      <StatCard label={t('sheetAnalytics.planned', 'Planned in period')} value={plan.planned} trend={`${t('sheetAnalytics.fact', 'Done')}: ${plan.completed} · ${t('sheetAnalytics.overdue', 'Overdue')}: ${plan.overdue}`} />
      <StatCard label={t('sheetAnalytics.queue', 'Not started')} value={queue.notStarted} trend={queue.oldestDays === null ? undefined : t('sheetAnalytics.oldest', 'Oldest: {{days}} d').replace('{{days}}', String(queue.oldestDays))} />
      {(metrics.guests?.completed ?? 0) > 0 && <StatCard label={t('sheetAnalytics.guests', 'Guests (link or QR)')} value={metrics.guests?.completed ?? 0} trend={`${t('sheetAnalytics.average', 'Average score')}: ${percent(metrics.guests?.averagePercentage ?? null)}`} />}
    </StatsGrid>
  );
}

type Row = SheetAnalytics['sheets'][number];

function SheetsTable({ rows, t }: { rows: Row[]; t: (key: string, fallback: string) => string }) {
  const columns: Column<Row>[] = [
    { key: 'title', label: t('sheetAnalytics.colSheet', 'Checklist'), priority: 'primary', render: (row) => plainText(row.title) },
    { key: 'plan', label: t('sheetAnalytics.colPlan', 'Plan'), priority: 'secondary', align: 'end', render: (row) => row.plan.planned },
    { key: 'fact', label: t('sheetAnalytics.colFact', 'Done'), priority: 'secondary', align: 'end', render: (row) => row.plan.completed },
    { key: 'overdue', label: t('sheetAnalytics.overdue', 'Overdue'), priority: 'tertiary', align: 'end', render: (row) => row.plan.overdue },
    { key: 'completion', label: t('sheetAnalytics.completion', 'Completion'), priority: 'primary', align: 'end', render: (row) => percent(row.completionPercentage) },
    { key: 'average', label: t('sheetAnalytics.average', 'Average score'), priority: 'primary', align: 'end', render: (row) => percent(row.averagePercentage) },
    { key: 'answered', label: t('sheetAnalytics.answered', 'Answered'), priority: 'tertiary', align: 'end', render: (row) => `${row.criteria.answered} / ${row.criteria.answered + row.criteria.remaining + row.criteria.skipped}` },
    { key: 'queue', label: t('sheetAnalytics.queue', 'Not started'), priority: 'tertiary', align: 'end', render: (row) => row.queue.notStarted },
  ];
  return <DataTable<Row> label={t('sheetAnalytics.tableLabel', 'Metrics by checklist')} columns={columns} rows={rows} keyExtractor={(row) => row.checklistId} responsiveDetails={{ label: t('courses.details', 'Details'), expandLabel: (row) => `${t('courses.details', 'Details')}: ${plainText(row.title)}`, collapseLabel: (row) => `${t('courses.details', 'Details')}: ${plainText(row.title)}` }} emptyMessage={t('sheetAnalytics.noSheets', 'No checklists available.')} />;
}

/** The tab itself; each role mounts it in its own layout and with its own tab strip. */
export function SheetAnalyticsContent({ Layout, currentPath, sessionPath }: { Layout: ComponentType<{ children: ReactNode; currentPath?: string }>; currentPath: string; sessionPath?: (sessionId: string) => string }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const period: Period = PERIODS.includes(searchParams.get('period') as Period) ? (searchParams.get('period') as Period) : 'month';
  const customFrom = searchParams.get('from') ?? '';
  const customTo = searchParams.get('to') ?? '';
  const departmentId = searchParams.get('departmentId') ?? '';
  const managerId = searchParams.get('managerId') ?? '';
  const search = searchParams.get('q') ?? '';
  const selected = parseSelectedSheets(searchParams.get('sheets'));
  const { from, to } = useMemo(() => resolvePeriodRange(period, new Date(), customFrom, customTo), [period, customFrom, customTo]);

  function update(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  const loadError = t('sheetAnalytics.loadError', 'Unable to load analytics.');
  const { state: sheetsState } = useAsyncData<SheetAnalyticsSheet[]>(() => listSheetAnalyticsSheets({ from, to }), [from, to], { unauthenticated: loadError, error: loadError });
  const { state: optionsState } = useAsyncData(() => getManagerChecklistAnalytics({ from, to }).then((data) => ({ departments: data.departmentOptions, managers: data.managerOptions ?? [] })), [from, to], { unauthenticated: '', error: '' });
  const key = selected.join(',');
  const { state } = useAsyncData<SheetAnalytics>(
    () => getSheetAnalytics({ from, to, checklistIds: selected.length ? selected : undefined, departmentId: departmentId || undefined, managerId: managerId || undefined }),
    [from, to, key, departmentId, managerId],
    { unauthenticated: loadError, error: loadError },
  );

  const sheets = sheetsState.status === 'loaded' ? sheetsState.data : [];
  const allIds = sheets.map((sheet) => sheet.id);
  const visible = filterSheets(sheets, search);
  const departments = optionsState.status === 'loaded' ? optionsState.data.departments : [];
  const managers = optionsState.status === 'loaded' ? optionsState.data.managers : [];
  const field: CSSProperties = { display: 'grid', gap: 6, fontWeight: 600 };

  return (
    <Layout currentPath={currentPath}>
      <header style={{ marginBottom: 20 }}>
        <div style={{ color: 'var(--color-primary)', fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>{t('manager.checklists.eyebrow', 'Workplace training')}</div>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px,4vw,36px)' }}>{t('sheetAnalytics.title', 'Checklist analytics')}</h1>
        <p style={{ margin: '8px 0 0', color: 'var(--color-text-muted)' }}>{t('sheetAnalytics.subtitle', 'Completion, scores and answers across all your checklists or the ones you pick.')}</p>
      </header>

      <Card style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))', gap: 16, marginBottom: 20 }}>
        <label style={field}>
          {t('manager.checklists.periodFilter', 'Period')}
          <select className="ds-input" value={period} onChange={(event) => update('period', event.target.value)}>
            <option value="week">{t('manager.checklists.periodWeek', 'Week')}</option>
            <option value="month">{t('manager.checklists.periodMonth', 'Month')}</option>
            <option value="quarter">{t('manager.checklists.periodQuarter', 'Quarter')}</option>
            <option value="custom">{t('manager.checklists.periodCustom', 'Custom')}</option>
          </select>
        </label>
        {period === 'custom' && (
          <>
            <label style={field}>{t('manager.checklists.from', 'From')}<input className="ds-input" type="date" value={customFrom} onChange={(event) => update('from', event.target.value)} /></label>
            <label style={field}>{t('manager.checklists.to', 'To')}<input className="ds-input" type="date" value={customTo} onChange={(event) => update('to', event.target.value)} /></label>
          </>
        )}
        {departments.length > 0 && (
          <label style={field}>
            {t('manager.checklists.departmentFilter', 'Department')}
            <select className="ds-input" value={departmentId} onChange={(event) => update('departmentId', event.target.value)}>
              <option value="">{t('manager.checklists.allDepartments', 'All departments')}</option>
              {departments.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
        )}
        {managers.length > 0 && (
          <label style={field}>
            {t('manager.checklists.managerFilter', 'Manager')}
            <select className="ds-input" value={managerId} onChange={(event) => update('managerId', event.target.value)}>
              <option value="">{t('manager.checklists.allManagers', 'All managers')}</option>
              <option value="unassigned">{t('manager.checklists.noManager', 'No manager')}</option>
              {managers.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
        )}
        <fieldset style={{ gridColumn: '1 / -1', margin: 0, padding: 0, border: 0, display: 'grid', gap: 8, minWidth: 0 }}>
          <legend style={{ fontWeight: 600, marginBottom: 6 }}>{t('sheetAnalytics.sheetsFilter', 'Checklists')}</legend>
          <input aria-label={t('sheetAnalytics.sheetSearch', 'Search checklists')} className="ds-input" type="search" value={search} onChange={(event) => update('q', event.target.value)} placeholder={t('sheetAnalytics.sheetSearch', 'Search checklists')} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, fontWeight: 600 }}>
            <input checked={selected.length === 0} onChange={() => update('sheets', '')} style={{ width: 20, height: 20, flex: 'none' }} type="checkbox" />
            {t('sheetAnalytics.allSheets', 'All available')}{allIds.length > 0 ? ` (${allIds.length})` : ''}
          </label>
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 2 }} data-testid="sheet-analytics-picker">
            {sheetsState.status === 'loading' && <span>{t('sheetAnalytics.loading', 'Loading...')}</span>}
            {visible.map((sheet) => {
              const checked = selected.length === 0 || selected.includes(sheet.id);
              return (
                <label key={sheet.id} style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
                  <input checked={checked} onChange={() => update('sheets', toggleSheet(selected, sheet.id, allIds).join(','))} style={{ width: 20, height: 20, flex: 'none' }} type="checkbox" />
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{plainText(sheet.title)} <span style={{ color: 'var(--color-text-muted)' }}>({sheet.sessionsInPeriod})</span></span>
                </label>
              );
            })}
            {sheetsState.status === 'loaded' && visible.length === 0 && <span style={{ color: 'var(--color-text-muted)' }}>{sheets.length === 0 ? t('sheetAnalytics.noSheets', 'No checklists available.') : t('sheetAnalytics.noMatch', 'No checklists match the search.')}</span>}
          </div>
        </fieldset>
      </Card>

      {state.status === 'loading' && <PageState message={t('sheetAnalytics.loading', 'Loading...')} variant="loading" />}
      {(state.status === 'unauthenticated' || state.status === 'notFound' || state.status === 'error') && <PageState title={t('sheetAnalytics.title', 'Checklist analytics')} message={state.message} variant="error" />}
      {state.status === 'loaded' && (state.data.sheets.length === 0 ? (
        <PageState message={t('sheetAnalytics.noSheets', 'No checklists available.')} />
      ) : state.data.total.plan.planned === 0 && state.data.total.selfCompleted === 0 && state.data.total.queue.notStarted === 0 ? (
        <PageState message={t('sheetAnalytics.noData', 'No sessions in this period yet. Results appear here once sessions on these checklists are planned or completed.')} />
      ) : (
        <div style={{ display: 'grid', gap: 20 }}>
          {state.data.truncated && <div role="status">{t('sheetAnalytics.truncated', 'The period holds more results than can be shown at once; the figures cover the newest ones. Narrow the period or the checklists.')}</div>}
          <SummaryCards metrics={state.data.total} t={t} />
          {state.data.total.scales.length > 0 && (
            <Card style={{ display: 'grid', gap: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>{t('sheetAnalytics.levelsTitle', 'Answers by scale level')}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 24 }}>
                {state.data.total.scales.map((scale) => <ScaleLevelBars key={scale.scaleKey} scale={scale} t={t} />)}
              </div>
            </Card>
          )}
          <section aria-labelledby="sheet-analytics-table" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 8 }}>
            <h2 id="sheet-analytics-table" style={{ fontSize: 20, margin: 0 }}>{t('sheetAnalytics.tableLabel', 'Metrics by checklist')}</h2>
            <SheetAnalyticsExport query={{ view: 'sheets', from, to, checklistIds: selected.length ? selected : undefined, departmentId: departmentId || undefined, managerId: managerId || undefined }} sheetName={t('sheetAnalytics.tableLabel', 'Metrics by checklist')} />
            <SheetsTable rows={state.data.sheets} t={t} />
          </section>
        </div>
      ))}
      {selected.length === 1 && sheetsState.status !== 'loading' && (
        <div style={{ marginTop: 24 }}>
          <SheetItemAnalytics
            departmentId={departmentId || undefined}
            from={from}
            managerId={managerId || undefined}
            sessionPath={sessionPath}
            sheetId={selected[0]!}
            title={plainText(sheets.find((sheet) => sheet.id === selected[0])?.title ?? '') || t('sheetAnalytics.unknownSheet', 'Checklist')}
            to={to}
          />
        </div>
      )}
    </Layout>
  );
}

function AdminSheetAnalyticsLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return <AdminPageLayout brandLabel={t('admin.navLink', 'Admin')} sidebarLabel={t('admin.navLink', 'Admin')} currentPath="/admin/checklists" navItems={[
    { label: t('admin.checklists.title', 'Checklists'), href: '/admin/checklists', isCurrent: true },
    { label: t('admin.checklists.sessions.title', 'Sessions'), href: '/admin/checklists/sessions' },
  ]}><ChecklistsTabs current="analytics" />{children}</AdminPageLayout>;
}

function ObserverSheetAnalyticsLayout({ children }: { children: ReactNode }) {
  return <ObserverPageLayout><ObserverSessionsNav current="sheetAnalytics" />{children}</ObserverPageLayout>;
}

function ManagerSheetAnalyticsLayout({ children }: { children: ReactNode }) {
  return <ManagerPageLayout currentPath="/manager/checklists"><ManagerViewSwitch current="sheets" />{children}</ManagerPageLayout>;
}

export function AdminSheetAnalyticsPage() {
  return <SheetAnalyticsContent Layout={AdminSheetAnalyticsLayout} currentPath="/admin/checklists" sessionPath={(id) => `/admin/checklists/sessions/${id}`} />;
}
export function ObserverSheetAnalyticsPage() {
  const { currentUser } = useSession();
  const sessionPath = currentUser?.roles.includes('instructor') ? (id: string) => `/instructor/checklists/sessions/all/${id}` : (id: string) => `/mentor/sessions/${id}`;
  return <SheetAnalyticsContent Layout={ObserverSheetAnalyticsLayout} currentPath="" sessionPath={sessionPath} />;
}
export function ManagerSheetAnalyticsPage() {
  return <SheetAnalyticsContent Layout={ManagerSheetAnalyticsLayout} currentPath="/manager/checklists" />;
}
