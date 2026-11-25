import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { AdminPageLayout } from '../../shared/adminPage.js';
import { apiRequest, getAssessmentPath, listAssessments } from '../../shared/apiClient.js';
import { ManagerPageLayout } from '../../shared/managerLayout.js';
import { Card, DataTable, PageState, type Column } from '../../shared/ui.js';
import { useAsyncData } from '../../shared/useAsyncData.js';
import { AnalyticsTrendChart, Bar, rateColor } from '../SheetAnalyticsDashboard.js';
import { FilterDropdown, moveFilter } from '../SheetAnalyticsFilters.js';

const places = ['standalone', 'course', 'longread'] as const;
const cards = ['passRate', 'average', 'duration', 'distribution', 'difficulty', 'traps', 'trend', 'departments', 'employees'] as const;
type CardId = typeof cards[number];
type CardSetting = { id: CardId; enabled: boolean };
type Choice = { id: string; name: string };
type Metric = Choice & { count: number; value: number };
type Attempt = { id: string; name: string; date: string; place: typeof places[number]; percentage: number; score: number; maxScore: number; passed: boolean };
type Analytics = {
  title: string; count: number; passed: number; places: Record<typeof places[number], number>;
  average: number | null; duration: number | null; distribution: number[];
  questions: Array<{ id: string; text: string | null; total: number; correct: number; trap: { text: string | null; count: number } | null }>;
  dates: Metric[]; departments: Metric[]; leaders: Metric[]; lagging: Metric[];
  filters: { departments: Choice[]; employees: Choice[]; groups: Choice[] };
  rows: Attempt[]; pageSize: number;
};

const grid = { display: 'grid', alignItems: 'start', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))', gap: 16 };
const toolbar = { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'center' };

function AnalyticsCards({ data, stored, onSaved }: { data: Analytics; stored: CardSetting[]; onSaved: (cards: CardSetting[]) => void }) {
  const { t } = useTranslation();
  const [layout, setLayout] = useState(() => [
    ...stored, ...cards.filter((id) => !stored.some((setting) => setting.id === id)).map((id) => ({ id, enabled: true })),
  ]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const save = async () => {
    setSaving(true);
    setSaveError(false);
    try {
      await apiRequest('/assessment-analytics/layout', { method: 'PUT', body: JSON.stringify(layout) });
      onSaved(layout);
      setEditing(false);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };
  const percent = (value: number | null) => value === null ? '—' : `${value}%`;
  const metrics = (rows: Metric[]) => <ul>{rows.map(({ id, name, value, count }) =>
    <li key={id}>{name || t('assessmentAnalytics.noDepartment')} · {percent(value)} ({count})</li>)}</ul>;
  const body: Record<CardId, ReactNode> = {
    passRate: <strong>{percent(data.count ? Math.round(100 * data.passed / data.count) : null)} ({data.passed}/{data.count})</strong>,
    average: <strong>{percent(data.average)}</strong>,
    distribution: data.distribution.map((count, index) => {
      const range = `${index * 10}–${index === 9 ? 100 : index * 10 + 9}%`;
      return <Bar key={range} label={range} value={data.count ? Math.round(count / data.count * 100) : null}
        hint={String(count)} color="var(--color-primary)" />;
    }),
    difficulty: data.questions.map((question) => {
      const value = Math.round(100 * question.correct / question.total);
      return <Bar key={question.id} label={question.text || t('assessmentAnalytics.untitledQuestion')} value={value}
        hint={`${question.correct}/${question.total}`} color={rateColor(value)} />;
    }),
    traps: <ul>{data.questions.flatMap(({ id, text, trap }) => trap ? [<li key={id}>
      {text || t('assessmentAnalytics.untitledQuestion')} · {trap.text || t('assessmentAnalytics.untitledOption')} ({trap.count})
    </li>] : [])}</ul>,
    duration: <strong>{data.duration === null ? '—' : t('assessmentAnalytics.durationValue', { count: data.duration })}</strong>,
    trend: <AnalyticsTrendChart title={t('assessmentAnalytics.trend')} unit="%" points={data.dates.map(({ id, name, value }) => ({ id, label: name, value }))} />,
    departments: data.departments.map(({ id, name, value, count }) => <Bar key={id} label={name || t('assessmentAnalytics.noDepartment')}
      value={value} hint={String(count)} color={rateColor(value)} />),
    employees: <><h3>{t('assessmentAnalytics.leaders')}</h3>{metrics(data.leaders)}<h3>{t('assessmentAnalytics.lagging')}</h3>{metrics(data.lagging)}</>,
  };

  return <>
    <button type="button" className="ds-button ds-button--secondary" style={{ justifySelf: 'start' }} aria-expanded={editing} disabled={saving} onClick={() => setEditing(!editing)}>
      {t('sheetAnalytics.customize')}
    </button>
    {saveError && <p role="alert">{t('assessmentAnalytics.saveError')}</p>}
    {editing && <Card style={{ background: 'var(--color-accent-muted)', borderStyle: 'dashed' }}><ul style={{ listStyle: 'none', padding: 0 }}>{layout.map(({ id, enabled }, index) => {
      const label = t(`assessmentAnalytics.${id}`);
      return <li key={id} style={toolbar}>
        <label><input type="checkbox" checked={enabled} disabled={saving} onChange={() => setLayout(layout.map((entry) => entry.id === id ? { id, enabled: !enabled } : entry))} /> {label}</label>
        <button type="button" className="ds-button ds-button--secondary" aria-label={t('assessmentAnalytics.moveUp', { label })} disabled={saving || index === 0} onClick={() => setLayout(moveFilter(layout, index, -1))}>↑</button>
        <button type="button" className="ds-button ds-button--secondary" aria-label={t('assessmentAnalytics.moveDown', { label })} disabled={saving || index === layout.length - 1} onClick={() => setLayout(moveFilter(layout, index, 1))}>↓</button>
      </li>;
    })}</ul><button type="button" className="ds-button ds-button--primary" disabled={saving} onClick={() => void save()}>{t('assessmentAnalytics.save')}</button></Card>}
    <div className="sheet-analytics-grid">{layout.filter(({ enabled }) => enabled).map(({ id }) => {
      const small = id === 'passRate' || id === 'average' || id === 'duration';
      return <section key={id} className={`ds-card sheet-analytics-widget sheet-analytics-widget--${small ? 's' : 'm'}`} style={{ overflowWrap: 'anywhere' }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>{t(`assessmentAnalytics.${id}`)}</h2>
        {body[id]}
      </section>;
    })}</div>
  </>;
}

function AssessmentAnalyticsContent({ base }: { base: string }) {
  const { t } = useTranslation();
  const { assessmentId } = useParams();
  const [search, setSearch] = useSearchParams();
  const id = assessmentId ?? search.get('assessment') ?? '';
  const filters = new URLSearchParams(search);
  filters.delete('assessment');
  const query = filters.toString();
  const details = Boolean(assessmentId);
  const error = t('assessmentAnalytics.error');
  const catalog = useAsyncData(() => details ? Promise.resolve([]) : listAssessments(), [details], { error, unauthenticated: error });
  const layout = useAsyncData((signal) => details ? Promise.resolve(null)
    : apiRequest<{ cards: CardSetting[] }>('/assessment-analytics/layout', { signal }),
  [details], { error, unauthenticated: error });
  const analytics = useAsyncData((signal) => id
    ? apiRequest<Analytics>(`${getAssessmentPath(id)}/analytics?${query}`, { signal })
    : Promise.resolve(null), [id, query], { error, unauthenticated: error });
  const data = analytics.state.status === 'loaded' ? analytics.state.data : null;
  const update = (field: string, value: string) => {
    const next = new URLSearchParams(search);
    if (field !== 'page') next.delete('page');
    if (field === 'assessment') {
      for (const key of ['departmentId', 'groupId', 'userId', 'attemptId']) next.delete(key);
    }
    if (value) next.set(field, value);
    else next.delete(field);
    setSearch(next);
  };
  const select = (field: string, choices: Choice[]) => {
    const selected = search.get(field) ?? '';
    return <label style={{ display: 'grid', gap: 4 }}>{t(`assessmentAnalytics.${field}`)}
      <select className="ds-input" value={selected} onChange={(event) => update(field, event.target.value)}>
        <option value="">{t('assessmentAnalytics.all')}</option>
        {selected && !choices.some(({ id }) => id === selected) && <option value={selected}>{selected}</option>}
        {choices.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>;
  };
  const page = Number(search.get('page') ?? 1);
  const columns: Column<Attempt>[] = [
    { key: 'name', label: t('assessmentAnalytics.userId'), priority: 'primary', render: ({ name }) => name },
    { key: 'date', priority: 'secondary', label: t('assessmentAnalytics.date'), render: ({ date }) => date },
    { key: 'place', priority: 'secondary', label: t('assessmentAnalytics.place'), render: ({ place }) => t(`assessmentAnalytics.${place}`) },
    { key: 'score', label: t('assessmentAnalytics.score'), priority: 'primary', render: ({ score, maxScore, percentage }) => `${score}/${maxScore} · ${percentage}%` },
    { key: 'status', priority: 'secondary', label: t('assessmentAnalytics.status'), render: ({ passed }) => t(passed ? 'assessmentAnalytics.passed' : 'assessmentAnalytics.failed') },
    { key: 'attempt', priority: 'secondary', label: t('assessmentAnalytics.attemptId'), render: ({ id }) =>
      <button className="ds-button ds-button--secondary" type="button" onClick={() => update('attemptId', id)}>{t('assessmentAnalytics.filterAttempt')}</button> },
  ];
  return <section style={{ display: 'grid', gap: 16 }}>
    <header><h1 style={{ margin: 0, fontSize: 'clamp(28px,4vw,36px)' }}>{t(details ? 'assessmentAnalytics.details' : 'assessmentAnalytics.title')}</h1></header>
    {details && <Link to={`${base}?${new URLSearchParams({ ...Object.fromEntries(filters), assessment: id })}`}>{t('assessmentAnalytics.title')}</Link>}
    {(!details || id) && <Card><div style={grid}>
    {!details && <label style={{ display: 'grid', gap: 4 }}>{t('assessmentAnalytics.assessment')}
      <select className="ds-input" value={id} onChange={(event) => update('assessment', event.target.value)}>
        <option value="">{t('assessmentAnalytics.choose')}</option>
        {catalog.state.status === 'loaded' && catalog.state.data.map((test) => <option key={test.id} value={test.id}>{test.title}</option>)}
      </select>
    </label>}
    {catalog.state.status === 'error' && !details && <PageState variant="error" message={error} action={<button type="button" onClick={() => void catalog.reload()}>{t('assessmentAnalytics.retry')}</button>} />}
    {id && <>
      <FilterDropdown label={t('assessmentAnalytics.period')} value={[search.get('from'), search.get('to')].filter(Boolean).join(' – ') || t('assessmentAnalytics.all')}>
        {(['from', 'to'] as const).map((field) => <label key={field} style={{ display: 'grid', gap: 4 }}>{t(`assessmentAnalytics.${field}`)}
          <input type="date" className="ds-input" value={search.get(field) ?? ''} onChange={(event) => update(field, event.target.value)} />
        </label>)}
      </FilterDropdown>
      {select('departmentId', data?.filters.departments ?? [])}
      {select('userId', data?.filters.employees ?? [])}
      {select('groupId', data?.filters.groups ?? [])}
      <form key={search.get('attemptId') ?? ''} style={{ display: 'grid', gap: 6, justifyItems: 'start' }} onSubmit={(event) => {
        event.preventDefault();
        update('attemptId', String(new FormData(event.currentTarget).get('attemptId') ?? '').trim());
      }}>
        <label style={{ display: 'grid', gap: 4, width: '100%' }}>{t('assessmentAnalytics.attemptId')}
          <input className="ds-input" name="attemptId" pattern="[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}" defaultValue={search.get('attemptId') ?? ''} />
        </label>
        <button className="ds-button ds-button--secondary" type="submit">{t('assessmentAnalytics.apply')}</button>
      </form>
    </>}
    </div></Card>}
    {id && analytics.state.status === 'loading' && <PageState variant="loading" message={t('assessments.loading')} />}
    {id && analytics.state.status !== 'loaded' && analytics.state.status !== 'loading' && <PageState variant="error" message={analytics.state.message} action={<button type="button" onClick={() => void analytics.reload()}>{t('assessmentAnalytics.retry')}</button>} />}
    {data && <>
      <h2>{data.title}</h2>
      <div style={toolbar}>
        {(['all', ...places] as const).map((place) => <button type="button" key={place} className={`ds-button ${(search.get('place') || 'all') === place ? 'ds-button--primary' : 'ds-button--secondary'}`}
          aria-pressed={(search.get('place') || 'all') === place} onClick={() => update('place', place === 'all' ? '' : place)}>
          {t(`assessmentAnalytics.${place}`)} ({place === 'all' ? Object.values(data.places).reduce((sum, count) => sum + count, 0) : data.places[place]})
        </button>)}
      </div>
      {!details && <Link className="ds-button ds-button--text" style={{ justifySelf: 'start' }} to={`${base}/${id}?${query}`}>{t('assessmentAnalytics.details')}</Link>}
      {!data.count && <PageState variant="info" message={t('assessmentAnalytics.empty')} />}
      {details ? <>
        <DataTable rows={data.rows} columns={columns} keyExtractor={({ id }) => id} responsiveDetails={{ label: t('courses.details'), expandLabel: ({ name }) => `${t('courses.details')} · ${name}`, collapseLabel: ({ name }) => `${t('courses.details')} · ${name}` }} label={t('assessmentAnalytics.details')} emptyMessage={t('assessmentAnalytics.empty')} />
        <div style={toolbar}>
          <button type="button" className="ds-button ds-button--secondary" disabled={page <= 1} onClick={() => update('page', String(page - 1))}>{t('assessmentAnalytics.previous')}</button>
          <button type="button" className="ds-button ds-button--secondary" disabled={page * data.pageSize >= data.count} onClick={() => update('page', String(page + 1))}>{t('assessmentAnalytics.next')}</button>
        </div>
      </> : layout.state.status === 'loaded' ? <AnalyticsCards key={JSON.stringify(layout.state.data?.cards)} data={data} stored={layout.state.data?.cards ?? []} onSaved={(cards) => layout.mutate(() => ({ cards }))} />
        : layout.state.status === 'loading' ? <PageState variant="loading" message={t('assessments.loading')} />
          : <PageState variant="error" message={layout.state.message} action={<button type="button" onClick={() => void layout.reload()}>{t('assessmentAnalytics.retry')}</button>} />}
    </>}
  </section>;
}

export function AdminAssessmentAnalyticsPage() {
  const { t } = useTranslation();
  return <AdminPageLayout brandLabel={t('admin.navLink')} sidebarLabel={t('admin.navLink')} navItems={[
    { label: t('admin.assessmentBuilder.title'), href: '/admin/assessments' },
  ]}><AssessmentAnalyticsContent base="/admin/assessments/analytics" /></AdminPageLayout>;
}

export function ManagerAssessmentAnalyticsPage() {
  return <ManagerPageLayout currentPath="/manager/reports"><AssessmentAnalyticsContent base="/manager/reports/assessments" /></ManagerPageLayout>;
}
