import { plainText } from '@lms/shared/rich-text';
import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import {
  getItemAnalytics,
  type ItemAnalytics,
  type ItemAnalyticsCriterion,
  type ItemAnalyticsFeedbackField,
  type ItemAnalyticsGroup,
  type ItemAnalyticsMetrics,
  type SheetAnalyticsScale,
} from '../shared/api/manager.js';
import { Button, Card, DataTable, PageState, StatCard, StatsGrid, type Column } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { SheetAnalyticsExport } from './SheetAnalyticsExport.js';
import { percent, ScaleLevelBars } from './SheetAnalyticsParts.js';

/**
 * PR 462: one sheet cut by criteria, groups, feedback fields and notes. It sits under the overview of the
 * "Analytics" tab when exactly one sheet is chosen. The cut, the search, the picked items and the notes page
 * live in the address bar (`cut`, `qi`, `pick`, `note`, `np`).
 */

export type Cut = 'criteria' | 'groups' | 'feedback' | 'notes';
export type SortKey = 'order' | 'completion' | 'average';

type T = (key: string, fallback: string) => string;
type Row = ItemAnalyticsCriterion | ItemAnalyticsGroup;
const rowKey = (row: Row) => row.id ?? '__none__';
const rowTitle = (row: Row) => ('text' in row ? plainText(row.text) : row.title ? plainText(row.title) : '');

/** Exported for tests: the picked ids of the address bar (`pick=id,id`); empty means "everything". */
export function parsePicked(value: string | null): string[] {
  return [...new Set((value ?? '').split(',').map((part) => part.trim()).filter(Boolean))];
}

/** Exported for tests: toggles one row; picking every row is stored as "everything" (empty). */
export function togglePicked(picked: readonly string[], id: string, all: readonly string[]): string[] {
  const base = picked.length === 0 ? [...all] : [...picked];
  const next = base.includes(id) ? base.filter((entry) => entry !== id) : [...base, id];
  return next.length === all.length && all.every((entry) => next.includes(entry)) ? [] : next;
}

/** Exported for tests: rows whose text contains the query (case-insensitive), in the requested order; a missing value sorts last. */
export function arrangeRows<R extends Row>(rows: readonly R[], query: string, sort: SortKey): R[] {
  const needle = query.trim().toLowerCase();
  const found = needle ? rows.filter((row) => rowTitle(row).toLowerCase().includes(needle)) : [...rows];
  if (sort === 'order') return found;
  const value = (row: R) => (sort === 'completion' ? row.completionPercentage : row.averagePercentage);
  return found
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const left = value(a.row);
      const right = value(b.row);
      if (left === null && right === null) return a.index - b.index;
      if (left === null) return 1;
      if (right === null) return -1;
      return left - right || a.index - b.index;
    })
    .map((entry) => entry.row);
}

/** Exported for tests: merges the level counts of several rows into one list of scales. */
export function mergeScales(rows: readonly Pick<ItemAnalyticsMetrics, 'scales'>[]): SheetAnalyticsScale[] {
  const merged = new Map<string, SheetAnalyticsScale>();
  for (const row of rows) {
    for (const scale of row.scales) {
      const target = merged.get(scale.scaleKey) ?? { ...scale, levels: [] };
      for (const level of scale.levels) {
        const same = target.levels.find((entry) => entry.value === level.value && entry.label === level.label);
        if (same) same.count += level.count; else target.levels.push({ ...level });
      }
      merged.set(scale.scaleKey, target);
    }
  }
  return [...merged.values()].map((scale) => ({ ...scale, levels: [...scale.levels].sort((a, b) => a.value - b.value) }));
}

/** Exported for tests: the total over the given rows, recomputed from the raw sums (not from rounded percentages). */
export function sumRows(rows: readonly Row[]): Omit<ItemAnalyticsMetrics, 'noteShare'> & { noteShare: number | null } {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const answered = rows.reduce((sum, row) => sum + row.answered, 0);
  const skipped = rows.reduce((sum, row) => sum + row.skipped, 0);
  const scoreSum = rows.reduce((sum, row) => sum + row.scoreSum, 0);
  const scoreMax = rows.reduce((sum, row) => sum + row.scoreMax, 0);
  const withNote = rows.reduce((sum, row) => sum + row.withNote, 0);
  return {
    total, answered, skipped, remaining: Math.max(0, total - answered - skipped),
    completionPercentage: total > 0 ? Math.round((answered / total) * 100) : null,
    averagePercentage: scoreMax > 0 ? Math.round((scoreSum / scoreMax) * 100) : null,
    scoreSum, scoreMax, withNote, noteShare: answered > 0 ? Math.round((withNote / answered) * 100) : null,
    scales: mergeScales(rows),
  };
}

function PercentBar({ value, label }: { value: number | null; label: string }) {
  return (
    <div style={{ display: 'grid', gap: 4, minWidth: 90 }}>
      <strong>{percent(value)}</strong>
      <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: 'var(--color-border, #e3e8ef)', overflow: 'hidden' }} title={label}>
        <div style={{ width: `${value ?? 0}%`, height: '100%', background: '#4f46e5' }} />
      </div>
    </div>
  );
}

function FeedbackCard({ field, t }: { field: ItemAnalyticsFeedbackField; t: T }) {
  const answered = field.options.reduce((sum, option) => sum + option.count, 0);
  const title = field.title ? plainText(field.title) : field.builtin === 'strengths' ? t('sheetAnalytics.fbStrengths', 'Strengths') : field.builtin === 'developmentAreas' ? t('sheetAnalytics.fbDevelopment', 'Development areas') : field.builtin === 'nextSteps' ? t('sheetAnalytics.fbNextSteps', 'Next steps') : field.id;
  return (
    <div data-testid="item-analytics-feedback"><Card style={{ display: 'grid', gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
      <div>{t('sheetAnalytics.fbFilled', 'Filled')}: <strong>{field.filled}</strong> · {t('sheetAnalytics.fbNotFilled', 'Not filled')}: <strong>{field.notFilled}</strong> ({t('sheetAnalytics.fbSessions', 'sessions')}: {field.sessions})</div>
      {field.kind === 'choice' && field.options.map((option) => {
        const share = answered > 0 ? Math.round((option.count / answered) * 100) : 0;
        return (
          <div key={option.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '2px 12px', alignItems: 'center' }}>
            <span style={{ overflowWrap: 'anywhere' }}>{plainText(option.name)}</span>
            <strong>{option.count} · {share}%</strong>
            <div aria-hidden="true" style={{ gridColumn: '1 / -1', height: 8, borderRadius: 4, background: 'var(--color-border, #e3e8ef)', overflow: 'hidden' }}>
              <div style={{ width: `${share}%`, height: '100%', background: '#4f46e5' }} />
            </div>
          </div>
        );
      })}
    </Card></div>
  );
}

export function SheetItemAnalytics({ sheetId, title, from, to, departmentId, managerId, sessionPath }: {
  sheetId: string; title: string; from: string; to: string; departmentId?: string; managerId?: string;
  /** Link to the session report of the role; omitted where the role has no report page. */
  sessionPath?: (sessionId: string) => string;
}) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sort, setSort] = useState<SortKey>('order');
  const requestedCut = searchParams.get('cut') as Cut | null;
  const search = searchParams.get('qi') ?? '';
  const picked = parsePicked(searchParams.get('pick'));
  const noteItem = searchParams.get('note') ?? '';
  const notesPage = Math.max(1, Number.parseInt(searchParams.get('np') ?? '1', 10) || 1);

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  }

  const loadError = t('sheetAnalytics.loadError', 'Unable to load analytics.');
  const query = { from, to, departmentId, managerId };
  const { state } = useAsyncData(
    () => Promise.all([getItemAnalytics(sheetId, { ...query, by: 'criteria' }), getItemAnalytics(sheetId, { ...query, by: 'groups' }), getItemAnalytics(sheetId, { ...query, by: 'feedback' })]),
    [sheetId, from, to, departmentId, managerId],
    { unauthenticated: loadError, error: loadError, notFound: t('sheetAnalytics.sheetGone', 'This checklist was deleted or is not available to you.') },
  );
  const cut: Cut = requestedCut ?? 'criteria';
  const { state: notesState } = useAsyncData<ItemAnalytics | null>(
    () => (cut === 'notes' ? getItemAnalytics(sheetId, { ...query, by: 'notes', page: notesPage, itemId: noteItem || undefined }) : Promise.resolve(null)),
    [sheetId, from, to, departmentId, managerId, cut, notesPage, noteItem],
    { unauthenticated: loadError, error: loadError },
  );

  const heading = <h2 style={{ margin: 0, fontSize: 20, overflowWrap: 'anywhere' }}>{t('sheetAnalytics.sheetTitle', 'Checklist “{{title}}” by items').replace('{{title}}', title)}</h2>;
  if (state.status === 'loading') return <section aria-label={title}>{heading}<PageState message={t('sheetAnalytics.loading', 'Loading...')} variant="loading" /></section>;
  if (state.status === 'notFound') return <section aria-label={title}>{heading}<PageState message={state.message} variant="error" /></section>;
  if (state.status !== 'loaded') return <section aria-label={title}>{heading}<PageState message={state.message} variant="error" /></section>;

  const [criteriaData, groupsData, feedbackData] = state.data;
  const criteria = (criteriaData.criteria ?? []) as ItemAnalyticsCriterion[];
  const groups = ((groupsData.groups ?? []) as ItemAnalyticsGroup[]);
  const feedback = feedbackData.feedback ?? [];
  const hasGroups = groups.some((group) => group.id !== null);
  const hasFeedback = feedback.length > 0;
  const cuts: Array<{ key: Cut; label: string }> = [
    { key: 'criteria', label: t('sheetAnalytics.cutCriteria', 'Criteria') },
    ...(hasGroups ? [{ key: 'groups' as const, label: t('sheetAnalytics.cutGroups', 'Groups') }] : []),
    ...(hasFeedback ? [{ key: 'feedback' as const, label: t('sheetAnalytics.cutFeedback', 'Feedback') }] : []),
    { key: 'notes', label: t('sheetAnalytics.cutNotes', 'Notes') },
  ];
  const activeCut: Cut = cuts.some((entry) => entry.key === cut) ? cut : 'criteria';
  const truncated = criteriaData.truncated;

  if (criteriaData.instances === 0) {
    return <section aria-label={title}>{heading}<PageState message={t('sheetAnalytics.noSessionsForSheet', 'This checklist has no sessions in the period yet.')} /></section>;
  }

  const rows: Row[] = activeCut === 'groups' ? groups : criteria;
  const ids = rows.map(rowKey);
  const livePicked = picked.filter((id) => ids.includes(id));
  const arranged = arrangeRows(rows, search, sort);
  const totals = sumRows(livePicked.length > 0 ? rows.filter((row) => livePicked.includes(rowKey(row))) : rows);
  const field: CSSProperties = { display: 'grid', gap: 6, fontWeight: 600 };
  const groupName = (row: Row) => ('text' in row ? groups.find((group) => group.id === row.groupId)?.title ?? '' : '');
  const noneLabel = t('sheetAnalytics.noGroup', 'Without a group');

  const columns: Column<Row>[] = [
    {
      key: 'pick', label: t('sheetAnalytics.colPick', 'Include'), priority: 'primary',
      render: (row) => (
        <input
          aria-label={`${t('sheetAnalytics.colPick', 'Include')}: ${rowTitle(row) || noneLabel}`}
          checked={livePicked.length === 0 || livePicked.includes(rowKey(row))}
          onChange={() => update({ pick: togglePicked(livePicked, rowKey(row), ids).join(',') })}
          style={{ width: 20, height: 20 }}
          type="checkbox"
        />
      ),
    },
    { key: 'name', label: activeCut === 'groups' ? t('sheetAnalytics.cutGroups', 'Groups') : t('sheetAnalytics.cutCriteria', 'Criteria'), priority: 'primary', render: (row) => <span style={{ overflowWrap: 'break-word' }}>{rowTitle(row) || noneLabel}</span> },
    ...(activeCut === 'criteria' && hasGroups ? [{ key: 'group', label: t('sheetAnalytics.colGroup', 'Group'), priority: 'tertiary' as const, render: (row: Row) => (groupName(row) ? plainText(groupName(row)) : '—') }] : []),
    { key: 'completion', label: t('sheetAnalytics.completion', 'Completion'), priority: 'primary', align: 'end', render: (row) => <PercentBar label={t('sheetAnalytics.completion', 'Completion')} value={row.completionPercentage} /> },
    { key: 'average', label: t('sheetAnalytics.average', 'Average score'), priority: 'primary', align: 'end', render: (row) => <PercentBar label={t('sheetAnalytics.average', 'Average score')} value={row.averagePercentage} /> },
    { key: 'answered', label: t('sheetAnalytics.answered', 'Answered'), priority: 'secondary', align: 'end', render: (row) => `${row.answered} / ${row.total}` },
    { key: 'remaining', label: t('sheetAnalytics.remaining', 'Left'), priority: 'tertiary', align: 'end', render: (row) => row.remaining },
    { key: 'notes', label: t('sheetAnalytics.colNotes', 'With a note'), priority: 'tertiary', align: 'end', render: (row) => `${row.withNote}${row.noteShare === null ? '' : ` · ${row.noteShare}%`}` },
  ];

  const noteCriteria = (notesState.status === 'loaded' && notesState.data?.criteria ? notesState.data.criteria : criteria) as Array<{ id: string; text: string; withNote: number }>;

  return (
    <section aria-label={title} data-testid="item-analytics" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 16 }}>
      {heading}
      {truncated && <div role="status">{t('sheetAnalytics.truncated', 'The period holds more results than can be shown at once; the figures cover the newest ones. Narrow the period or the checklists.')}</div>}
      <div aria-label={t('sheetAnalytics.cutLabel', 'Cut')} role="group" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {cuts.map((entry) => (
          <Button aria-pressed={entry.key === activeCut} key={entry.key} onClick={() => update({ cut: entry.key === 'criteria' ? '' : entry.key, pick: '', qi: '', note: '', np: '' })} size="sm" type="button" variant={entry.key === activeCut ? 'primary' : 'secondary'}>{entry.label}</Button>
        ))}
      </div>

      <SheetAnalyticsExport
        query={{
          view: activeCut, from, to, checklistId: sheetId, departmentId, managerId,
          ...(activeCut === 'criteria' || activeCut === 'groups' ? { pick: livePicked, q: search.trim() || undefined, sort: sort === 'order' ? undefined : sort } : {}),
          ...(activeCut === 'notes' && noteItem ? { itemId: noteItem } : {}),
        }}
        sheetName={cuts.find((entry) => entry.key === activeCut)?.label ?? title}
      />

      {(activeCut === 'criteria' || activeCut === 'groups') && (
        <>
          <StatsGrid>
            <StatCard label={livePicked.length > 0 ? t('sheetAnalytics.totalPicked', 'Total for the picked ({{count}})').replace('{{count}}', String(livePicked.length)) : t('sheetAnalytics.totalAll', 'Total for all')} value={percent(totals.completionPercentage)} trend={`${t('sheetAnalytics.answered', 'Answered')}: ${totals.answered} / ${totals.total}`} />
            <StatCard label={t('sheetAnalytics.average', 'Average score')} value={percent(totals.averagePercentage)} />
            <StatCard label={t('sheetAnalytics.remaining', 'Left')} value={totals.remaining} trend={`${t('sheetAnalytics.skipped', 'Skipped')}: ${totals.skipped}`} />
            <StatCard label={t('sheetAnalytics.colNotes', 'With a note')} value={totals.withNote} trend={totals.noteShare === null ? undefined : `${totals.noteShare}%`} />
          </StatsGrid>
          {totals.scales.length > 0 && (
            <Card style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 24 }}>
              {totals.scales.map((scale) => <ScaleLevelBars key={scale.scaleKey} scale={scale} t={t} />)}
            </Card>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: 12 }}>
            <label style={field}>
              {t('sheetAnalytics.itemSearch', 'Search by text')}
              <input className="ds-input" onChange={(event) => update({ qi: event.target.value })} type="search" value={search} />
            </label>
            <label style={field}>
              {t('sheetAnalytics.sortLabel', 'Sort')}
              <select className="ds-input" onChange={(event) => setSort(event.target.value as SortKey)} value={sort}>
                <option value="order">{t('sheetAnalytics.sortOrder', 'As in the checklist')}</option>
                <option value="completion">{t('sheetAnalytics.sortCompletion', 'By completion, lowest first')}</option>
                <option value="average">{t('sheetAnalytics.sortAverage', 'By average score, lowest first')}</option>
              </select>
            </label>
            {livePicked.length > 0 && <div style={{ alignSelf: 'end' }}><Button onClick={() => update({ pick: '' })} size="sm" type="button" variant="secondary">{t('sheetAnalytics.pickAll', 'Include all')}</Button></div>}
          </div>
          <DataTable<Row>
            columns={columns}
            emptyMessage={t('sheetAnalytics.noItemMatch', 'Nothing matches the search.')}
            keyExtractor={rowKey}
            label={activeCut === 'groups' ? t('sheetAnalytics.cutGroups', 'Groups') : t('sheetAnalytics.cutCriteria', 'Criteria')}
            responsiveDetails={{ label: t('courses.details', 'Details'), expandLabel: (row) => `${t('courses.details', 'Details')}: ${rowTitle(row) || noneLabel}`, collapseLabel: (row) => `${t('courses.details', 'Details')}: ${rowTitle(row) || noneLabel}` }}
            rows={arranged}
          />
        </>
      )}

      {activeCut === 'feedback' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: 16 }}>
          {feedback.map((entry) => <FeedbackCard field={entry} key={entry.id} t={t} />)}
        </div>
      )}

      {activeCut === 'notes' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 12 }}>
          <label style={{ ...field, maxWidth: 480 }}>
            {t('sheetAnalytics.noteFilter', 'Criterion')}
            <select className="ds-input" onChange={(event) => update({ note: event.target.value, np: '' })} value={noteItem}>
              <option value="">{t('sheetAnalytics.noteAll', 'All criteria')}</option>
              {noteCriteria.map((entry) => <option key={entry.id} value={entry.id}>{plainText(entry.text)} ({entry.withNote})</option>)}
            </select>
          </label>
          {notesState.status === 'loading' && <PageState message={t('sheetAnalytics.loading', 'Loading...')} variant="loading" />}
          {(notesState.status === 'error' || notesState.status === 'unauthenticated' || notesState.status === 'notFound') && <PageState message={notesState.message} variant="error" />}
          {notesState.status === 'loaded' && notesState.data?.notes && (
            notesState.data.notes.total === 0 ? <PageState message={t('sheetAnalytics.noNotes', 'No notes in this period.')} /> : (
              <>
                <ul data-testid="item-analytics-notes" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                  {notesState.data.notes.items.map((note, index) => (
                    <li key={`${note.sessionId ?? 'self'}-${note.itemId}-${index}`}>
                      <Card style={{ display: 'grid', gap: 6 }}>
                        <strong style={{ overflowWrap: 'anywhere' }}>{plainText(note.itemText)}</strong>
                        {note.comment && <div style={{ overflowWrap: 'anywhere' }}>{note.comment}</div>}
                        {note.reviewComment && <div style={{ overflowWrap: 'anywhere' }}><em>{t('sheetAnalytics.reviewNote', 'Reviewer')}:</em> {note.reviewComment}</div>}
                        <small style={{ color: 'var(--color-text-muted)' }}>
                          {note.employee}{note.observer ? ` · ${note.observer}` : ''}{note.at ? ` · ${new Date(note.at).toLocaleDateString()}` : ''}
                          {note.sessionId && sessionPath && <> · <Link to={sessionPath(note.sessionId)}>{t('sheetAnalytics.openReport', 'Session report')}</Link></>}
                        </small>
                      </Card>
                    </li>
                  ))}
                </ul>
                {notesState.data.notes.total > notesState.data.notes.pageSize && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button disabled={notesPage <= 1} onClick={() => update({ np: notesPage <= 2 ? '' : String(notesPage - 1) })} size="sm" type="button" variant="secondary">{t('sheetAnalytics.prev', 'Previous')}</Button>
                    <span>{notesPage} / {Math.ceil(notesState.data.notes.total / notesState.data.notes.pageSize)}</span>
                    <Button disabled={notesPage * notesState.data.notes.pageSize >= notesState.data.notes.total} onClick={() => update({ np: String(notesPage + 1) })} size="sm" type="button" variant="secondary">{t('sheetAnalytics.next', 'Next')}</Button>
                  </div>
                )}
              </>
            )
          )}
        </div>
      )}
    </section>
  );
}
