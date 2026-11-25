import { AnalyticsFieldFilter } from '../features/user-fields/AnalyticsFieldFilter.js';
import { plainText } from '@lms/shared/rich-text';
import { Fragment, useEffect, useMemo, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';

import { AdminPageLayout, ChecklistsTabs } from '../shared/adminPage.js';
import {
  getAnalyticsDashboardLayout,
  getAnalyticsFilterSet,
  getManagerChecklistAnalytics,
  getSheetAnalytics,
  listSheetAnalyticsSheets,
  saveAnalyticsDashboardLayout,
  type AnalyticsDashboardSet,
  type AnalyticsFilterKey,
  type AnalyticsFilterSet,
  type SheetAnalytics,
  type SheetAnalyticsSheet,
} from '../shared/api/manager.js';
import { ManagerPageLayout } from '../shared/managerLayout.js';
import { useSession } from '../shared/session.js';
import { ObserverPageLayout } from '../shared/observerLayout.js';
import { Card, DataTable, PageState, type Column } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { percent, ScaleLevelBars } from './SheetAnalyticsParts.js';
import { parseSlice, resolveDashboards } from './SheetAnalyticsLayout.js';
import { SheetAnalyticsSlice } from './SheetAnalyticsSlice.js';
import { SheetAnalyticsExport } from './SheetAnalyticsExport.js';
import { DashboardGrid } from './SheetAnalyticsDashboardGrid.js';
import { DepartmentFilter, EmployeeFilter, FilterDropdown, FilterSetEditor, ids, resolveFilterKeys } from './SheetAnalyticsFilters.js';
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

/** Exported for tests: "select found" keeps only the listed sheets; every sheet picked is stored as "all" (empty). */
export function selectFound(found: readonly string[], all: readonly string[]): string[] {
  return found.length === all.length && all.every((id) => found.includes(id)) ? [] : [...found];
}

export { ScaleLevelBars };

type Row = SheetAnalytics['sheets'][number];

function SheetsTable({ rows, fieldColumn, t, detailsHref }: { rows: Row[]; fieldColumn?: string; t: (key: string, fallback: string) => string; detailsHref: (id: string) => string }) {
  const columns: Column<Row>[] = [
    { key: 'title', label: t('sheetAnalytics.colSheet', 'Checklist'), priority: 'primary', render: (row) => <Link to={detailsHref(row.checklistId)}>{plainText(row.title)}</Link> },
    ...(fieldColumn ? [{ key: 'userField', label: fieldColumn, priority: 'primary' as const, render: (row: Row) => row.fieldLabel || '—' }] : []),
    { key: 'plan', label: t('sheetAnalytics.colPlan', 'Plan'), priority: 'secondary', align: 'end', render: (row) => row.plan.planned },
    { key: 'fact', label: t('sheetAnalytics.colFact', 'Done'), priority: 'secondary', align: 'end', render: (row) => row.plan.completed },
    { key: 'overdue', label: t('sheetAnalytics.overdue', 'Overdue'), priority: 'tertiary', align: 'end', render: (row) => row.plan.overdue },
    { key: 'completion', label: t('sheetAnalytics.completion', 'Completion'), priority: 'primary', align: 'end', render: (row) => percent(row.completionPercentage) },
    { key: 'average', label: t('sheetAnalytics.average', 'Average score'), priority: 'primary', align: 'end', render: (row) => percent(row.averagePercentage) },
    { key: 'answered', label: t('sheetAnalytics.answered', 'Answered'), priority: 'tertiary', align: 'end', render: (row) => `${row.criteria.answered} / ${row.criteria.answered + row.criteria.remaining + row.criteria.skipped}` },
    { key: 'queue', label: t('sheetAnalytics.queue', 'Not started'), priority: 'tertiary', align: 'end', render: (row) => row.queue.notStarted },
  ];
  return <DataTable<Row> label={t('sheetAnalytics.tableLabel', 'Metrics by checklist')} columns={columns} rows={rows} keyExtractor={(row) => JSON.stringify([row.checklistId, row.groupKey])} responsiveDetails={{ label: t('courses.details', 'Details'), expandLabel: (row) => `${t('courses.details', 'Details')}: ${plainText(row.title)}`, collapseLabel: (row) => `${t('courses.details', 'Details')}: ${plainText(row.title)}` }} emptyMessage={t('sheetAnalytics.noSheets', 'No checklists available.')} />;
}

/** The tab itself; each role mounts it in its own layout and with its own tab strip. */
export function SheetAnalyticsContent({ Layout, currentPath, sessionPath }: { Layout: ComponentType<{ children: ReactNode; currentPath?: string }>; currentPath: string; sessionPath?: (sessionId: string) => string }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const period: Period = PERIODS.includes(searchParams.get('period') as Period) ? (searchParams.get('period') as Period) : 'month';
  const customFrom = searchParams.get('from') ?? '';
  const customTo = searchParams.get('to') ?? '';
  const departmentId = searchParams.get('departmentId') ?? '';
  const selectedDepartments = ids(searchParams.get('departments') ?? departmentId);
  const selectedEmployees = ids(searchParams.get('employees') ?? '');
  const departmentIds = selectedDepartments.join(',') || undefined;
  const employeeIds = selectedEmployees.join(',') || undefined;
  const managerId = searchParams.get('managerId') ?? '';
  const fieldFilters = searchParams.get('fieldFilters') || undefined;
  const groupByField = searchParams.get('groupByField') || undefined;
  const search = searchParams.get('q') ?? '';
  // PR 519: the dashboard lives at the base address; one checklist opens on its own page (base/:checklistId) with the same filters.
  const { checklistId } = useParams();
  const { pathname } = useLocation();
  const base = checklistId ? pathname.slice(0, pathname.lastIndexOf('/')) : pathname.replace(/\/$/, '');
  const selected = checklistId ? [checklistId] : parseSelectedSheets(searchParams.get('sheets'));
  const slice = parseSlice(searchParams.get('slice'));
  const carry = (() => { const next = new URLSearchParams(searchParams); next.delete('sheets'); next.delete('q'); next.delete('slice'); const text = next.toString(); return text ? `?${text}` : ''; })();
  const detailsHref = (id: string) => `${base}/${id}${carry}`;
  const { from, to } = useMemo(() => resolvePeriodRange(period, new Date(), customFrom, customTo), [period, customFrom, customTo]);

  function update(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    if (key === 'departments') next.delete('departmentId');
    setSearchParams(next, { replace: true });
  }

  const { currentUser } = useSession();
  const isAdmin = currentUser?.roles.includes('admin') ?? false;
  const [filterSet, setFilterSet] = useState<AnalyticsFilterSet | null>(null);
  useEffect(() => {
    let active = true;
    void getAnalyticsFilterSet().then((set) => { if (active) setFilterSet(set); }, () => {});
    return () => { active = false; };
  }, []);
  // PR 520: the widgets of the dashboard (own layout, else the organization default, else the built-in set) and the "Customize" mode.
  // null until the saved layout has been asked for, so the cards never flash in the built-in order first.
  const [set, setSet] = useState<AnalyticsDashboardSet | null>(null);
  const [editing, setEditing] = useState(false);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [layoutFailed, setLayoutFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void getAnalyticsDashboardLayout().then((loaded) => { if (active) setSet(resolveDashboards(loaded)); }, () => { if (active) setSet(resolveDashboards(null)); });
    return () => { active = false; };
  }, []);
  async function saveLayout(next: AnalyticsDashboardSet | null, scope: 'user' | 'organization') {
    setLayoutBusy(true);
    setLayoutFailed(false);
    try {
      const saved = await saveAnalyticsDashboardLayout(next, scope);
      if (next === null) setSet(resolveDashboards(saved));
    } catch {
      setLayoutFailed(true);
    } finally {
      setLayoutBusy(false);
    }
  }
  const enabledFilters = useMemo(() => resolveFilterKeys(filterSet).filter((key) => !(checklistId && key === 'sheets')), [filterSet, checklistId]);

  const loadError = t('sheetAnalytics.loadError', 'Unable to load analytics.');
  const { state: sheetsState } = useAsyncData<SheetAnalyticsSheet[]>(() => listSheetAnalyticsSheets({ from, to }), [from, to], { unauthenticated: loadError, error: loadError });
  const { state: optionsState } = useAsyncData(() => getManagerChecklistAnalytics({ from, to }).then((data) => ({ departments: data.departmentOptions, managers: data.managerOptions ?? [] })), [from, to], { unauthenticated: '', error: '' });
  const key = selected.join(',');
  const { state } = useAsyncData<SheetAnalytics>(
    () => getSheetAnalytics({ from, to, tzOffset: -new Date().getTimezoneOffset(), checklistIds: selected.length ? selected : undefined, departmentIds, employeeIds, managerId: managerId || undefined, fieldFilters, groupByField }),
    [from, to, key, departmentIds, employeeIds, managerId, fieldFilters, groupByField],
    { unauthenticated: loadError, error: loadError },
  );

  const sheets = sheetsState.status === 'loaded' ? sheetsState.data : [];
  const allIds = sheets.map((sheet) => sheet.id);
  const visible = filterSheets(sheets, search);
  const departments = optionsState.status === 'loaded' ? optionsState.data.departments : [];
  const managers = optionsState.status === 'loaded' ? optionsState.data.managers : [];
  const field: CSSProperties = { display: 'grid', gap: 6, fontWeight: 600 };

  const filterNodes: Record<AnalyticsFilterKey, ReactNode> = {
    period: (
      <>
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
      </>
    ),
    sheets: (
        <FilterDropdown label={t('sheetAnalytics.sheetsFilter', 'Checklists')} value={selected.length === 0 ? `${t('sheetAnalytics.allSheets', 'All available')}${allIds.length > 0 ? ` (${allIds.length})` : ''}` : selected.length === 1 ? (plainText(sheets.find((sheet) => sheet.id === selected[0])?.title ?? '') || '1') : `${selected.length}`} wide>
          <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
            <input aria-label={t('sheetAnalytics.sheetSearch', 'Search checklists')} className="ds-input" type="search" value={search} onChange={(event) => update('q', event.target.value)} placeholder={t('sheetAnalytics.sheetSearch', 'Search checklists')} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, fontWeight: 600 }}>
                <input checked={selected.length === 0} onChange={() => update('sheets', '')} style={{ width: 20, height: 20, flex: 'none' }} type="checkbox" />
                {t('sheetAnalytics.allSheets', 'All available')}{allIds.length > 0 ? ` (${allIds.length})` : ''}
              </label>
              {search.trim() !== '' && visible.length > 0 && (
                <button className="ds-button ds-button--secondary ds-button--sm" onClick={() => update('sheets', selectFound(visible.map((sheet) => sheet.id), allIds).join(','))} type="button">
                  {t('sheetAnalytics.selectFound', 'Select found')} ({visible.length})
                </button>
              )}
              <span aria-live="polite" style={{ color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                {t('sheetAnalytics.selectedCount', 'Selected {{selected}} of {{total}}', { selected: selected.length === 0 ? allIds.length : selected.length, total: allIds.length })}
              </span>
            </div>
            {selected.length > 0 && (
              <ul aria-label={t('sheetAnalytics.selectedList', 'Selected checklists')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
                {selected.map((id) => {
                  const title = plainText(sheets.find((sheet) => sheet.id === id)?.title ?? '') || t('sheetAnalytics.unknownSheet', 'Checklist');
                  return (
                    <li className="ui-status-badge" key={id} style={{ alignItems: 'center', display: 'inline-flex', gap: 4 }}>
                      {title}
                      <button aria-label={`${t('sheetAnalytics.removeSheet', 'Remove')}: ${title}`} className="ds-button ds-button--text ds-button--icon" onClick={() => update('sheets', toggleSheet(selected, id, allIds).join(','))} type="button">×</button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 2 }} data-testid="sheet-analytics-picker">
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
          </div>
        </FilterDropdown>
    ),
    department: departments.length > 0 ? <DepartmentFilter options={departments} selected={selectedDepartments} onChange={(value) => update('departments', value.join(','))} /> : null,
    employee: <EmployeeFilter selected={selectedEmployees} onChange={(value) => update('employees', value.join(','))} />,
    manager: managers.length > 0 ? (
      <label style={field}>
        {t('manager.checklists.managerFilter', 'Manager')}
        <select className="ds-input" value={managerId} onChange={(event) => update('managerId', event.target.value)}>
          <option value="">{t('manager.checklists.allManagers', 'All managers')}</option>
          <option value="unassigned">{t('manager.checklists.noManager', 'No manager')}</option>
          {managers.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </label>
    ) : null,
    userFields: (
        <FilterDropdown label={t('sheetAnalytics.moreFilters', 'More filters')} value={fieldFilters || groupByField ? t('sheetAnalytics.filterOn', 'On') : t('sheetAnalytics.filterAny', 'Any')} wide>
          <AnalyticsFieldFilter value={fieldFilters} onChange={(value) => update('fieldFilters', value)} groupBy={groupByField} onGroupBy={(value) => update('groupByField', value)} />
        </FilterDropdown>
    ),
  };

  return (
    <Layout currentPath={currentPath}>
      <header style={{ alignItems: 'flex-end', display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--color-primary)', fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>{t('manager.checklists.eyebrow', 'Workplace training')}</div>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px,4vw,36px)' }}>{t('sheetAnalytics.title', 'Checklist analytics')}</h1>
          <p style={{ margin: '8px 0 0', color: 'var(--color-text-muted)' }}>{t('sheetAnalytics.subtitle', 'Completion, scores and answers across all your checklists or the ones you pick.')}</p>
        </div>
        {!checklistId && (
          <button aria-pressed={editing} className={`ds-button ${editing ? 'ds-button--primary' : 'ds-button--secondary'}`} onClick={() => setEditing(!editing)} type="button">
            {editing ? `✓ ${t('sheetAnalytics.customizeDone', 'Done')}` : `⚙ ${t('sheetAnalytics.customize', 'Customize dashboard')}`}
          </button>
        )}
      </header>

      <Card style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))', gap: 16, marginBottom: 20, alignItems: 'end' }}>
        {enabledFilters.map((key) => <Fragment key={key}>{filterNodes[key]}</Fragment>)}
        <FilterSetEditor enabled={enabledFilters} isAdmin={isAdmin} onSaved={setFilterSet} />
      </Card>

      {checklistId ? (
        sheetsState.status !== 'loading' && (
          <>
            <Link className="ds-button ds-button--text" style={{ justifySelf: 'start', marginBottom: 12 }} to={`${base}${carry}`}>← {t('sheetAnalytics.backToSummary', 'Back to summary')}</Link>
            <SheetItemAnalytics
              departmentIds={departmentIds}
              employeeIds={employeeIds}
              from={from}
              managerId={managerId || undefined}
              fieldFilters={fieldFilters}
              sessionPath={sessionPath}
              sheetId={checklistId}
              title={plainText(sheets.find((sheet) => sheet.id === checklistId)?.title ?? '') || t('sheetAnalytics.unknownSheet', 'Checklist')}
              to={to}
            />
          </>
        )
      ) : slice ? (
        <>
          <Link className="ds-button ds-button--text" style={{ justifySelf: 'start', marginBottom: 12 }} to={`${base}${carry}`}>← {t('sheetAnalytics.backToSummary', 'Back to summary')}</Link>
          <SheetAnalyticsSlice
            detailsHref={detailsHref}
            query={{ from, to, tzOffset: -new Date().getTimezoneOffset(), checklistIds: selected.length ? selected : undefined, departmentIds, employeeIds, managerId: managerId || undefined, fieldFilters, ...slice }}
            sessionPath={sessionPath}
          />
        </>
      ) : (
        <>
      {(state.status === 'loading' || (state.status === 'loaded' && set === null)) && <PageState message={t('sheetAnalytics.loading', 'Loading...')} variant="loading" />}
      {(state.status === 'unauthenticated' || state.status === 'notFound' || state.status === 'error') && <PageState title={t('sheetAnalytics.title', 'Checklist analytics')} message={state.message} variant="error" />}
      {state.status === 'loaded' && set !== null && (state.data.sheets.length === 0 ? (
        <PageState message={t('sheetAnalytics.noSheets', 'No checklists available.')} />
      ) : state.data.total.plan.planned === 0 && state.data.total.selfCompleted === 0 && state.data.total.queue.notStarted === 0 ? (
        <PageState message={t('sheetAnalytics.noData', 'No sessions in this period yet. Results appear here once sessions on these checklists are planned or completed.')} />
      ) : (
        <div style={{ display: 'grid', gap: 20 }}>
          {state.data.truncated && <div role="status">{t('sheetAnalytics.truncated', 'The period holds more results than can be shown at once; the figures cover the newest ones. Narrow the period or the checklists.')}</div>}
          <DashboardGrid
            busy={layoutBusy}
            data={state.data}
            detailsHref={detailsHref}
            editing={editing}
            failed={layoutFailed}
            isAdmin={isAdmin}
            onChange={(next) => { setSet(next); void saveLayout(next, 'user'); }}
            onPickDepartment={(id) => update('departments', id)}
            onPickEmployee={(id) => update('employees', id)}
            onReset={() => void saveLayout(null, 'user')}
            onSlice={(value) => update('slice', value)}
            placesQuery={{ from, to, checklistIds: selected.length ? selected : undefined, departmentIds, employeeIds, managerId: managerId || undefined, fieldFilters }}
            sessionPath={sessionPath}
            onSaveOrganization={() => void saveLayout(set, 'organization')}
            sheetTitles={new Map(sheets.map((sheet) => [sheet.id, sheet.title]))}
            set={set}
          />
          <section aria-labelledby="sheet-analytics-table" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 8 }}>
            <h2 id="sheet-analytics-table" style={{ fontSize: 20, margin: 0 }}>{t('sheetAnalytics.tableLabel', 'Metrics by checklist')}</h2>
            <SheetAnalyticsExport query={{ view: 'sheets', from, to, checklistIds: selected.length ? selected : undefined, departmentIds, employeeIds, managerId: managerId || undefined, fieldFilters, groupByField }} sheetName={t('sheetAnalytics.tableLabel', 'Metrics by checklist')} />
            <SheetsTable detailsHref={detailsHref} rows={state.data.sheets} fieldColumn={state.data.fieldColumn} t={t} />
          </section>
        </div>
      ))}
        </>
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
