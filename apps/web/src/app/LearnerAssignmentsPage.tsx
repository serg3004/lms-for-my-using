import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listAssignments } from '../shared/api/assignments.js';
import type { AssignmentSummary } from '../shared/api/types.js';
import { Pagination, PageState } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

type ExtendedAssignment = AssignmentSummary & {
  courseTitle?: string | null;
  course?: { title?: string | null } | null;
  userName?: string | null;
  groupName?: string | null;
};

type AssignmentsData = { assignments: ExtendedAssignment[]; total: number; pageSize: number };

type StatusFilter = 'all' | 'assigned' | 'completed' | 'overdue';
type TypeFilter = 'all' | 'course';

function getCourseTitle(a: ExtendedAssignment) {
  return a.courseTitle ?? a.course?.title ?? null;
}

function isOverdue(dueAt: string | null) {
  return dueAt !== null && new Date(dueAt) < new Date();
}

function isDueThisWeek(dueAt: string | null) {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  const now = new Date();
  const weekAhead = new Date(now);
  weekAhead.setDate(now.getDate() + 7);
  return due >= now && due <= weekAhead;
}

function formatDueDate(dueAt: string | null) {
  if (!dueAt) return null;
  return new Date(dueAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getEffectiveStatus(a: ExtendedAssignment): 'overdue' | 'completed' | 'assigned' {
  if (a.status === 'completed') return 'completed';
  if (isOverdue(a.dueAt)) return 'overdue';
  return 'assigned';
}

const STATUS_BADGE = {
  overdue:   { labelKey: 'assignments.statusBadgeUrgent',  bg: '#fef2f2', color: '#dc2626' },
  assigned:  { labelKey: 'assignments.statusBadgeActive',  bg: '#eef2ff', color: '#4f46e5' },
  completed: { labelKey: 'assignments.statusBadgeDone',    bg: '#e9f8f2', color: '#0f9f6e' },
} as const;

const TYPE_BADGE = { labelKey: 'assignments.typeBadgeCourse', bg: '#eef2ff', color: '#4f46e5' } as const;

function Badge({ bg, color, label }: { bg: string; color: string; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', borderRadius: '999px',
      padding: '7px 10px', fontSize: '12px', fontWeight: 800,
      background: bg, color,
    }}>
      {label}
    </span>
  );
}

function SummaryCard({ value, label }: { value: number; label: string }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e3e8ef', borderRadius: '14px',
      padding: '18px', boxShadow: '0 6px 18px rgba(23,32,51,.04)',
    }}>
      <strong style={{ display: 'block', fontSize: '28px', marginBottom: '5px', color: '#172033' }}>{value}</strong>
      <span style={{ color: '#6b7280', fontSize: '13px' }}>{label}</span>
    </div>
  );
}

function ProgressBar({ pct, success, label }: { pct: number; success?: boolean; label: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '8px', fontSize: '13px' }}>
        <span style={{ color: '#6b7280' }}>{label}</span>
        <strong style={{ color: '#172033' }}>{pct}%</strong>
      </div>
      <div style={{ height: '9px', background: '#edf0f5', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: '999px', width: `${pct}%`,
          background: success ? '#0f9f6e' : 'linear-gradient(90deg,#4f46e5,#7c3aed)',
          transition: 'width .3s ease',
        }} />
      </div>
    </div>
  );
}

export function LearnerAssignmentsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const { state: loadState } = useAsyncData<AssignmentsData>(
    async () => {
      const result = await listAssignments({ page, pageSize: 20 });
      return { assignments: result.items as ExtendedAssignment[], total: result.total, pageSize: result.pageSize };
    },
    [page, t],
    { unauthenticated: t('assignments.sessionExpired'), error: t('assignments.loadError') },
  );
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const filtered = useMemo(() => {
    const all = loadState.status === 'loaded' ? loadState.data.assignments : [];
    const q = search.toLowerCase();
    return all.filter((a) => {
      const title = getCourseTitle(a) ?? '';
      const matchesSearch = !q || title.toLowerCase().includes(q);
      const effective = getEffectiveStatus(a);
      const matchesStatus = statusFilter === 'all' || effective === statusFilter;
      const matchesType = typeFilter === 'all' || typeFilter === 'course';
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [loadState, search, statusFilter, typeFilter]);

  if (loadState.status === 'loading') {
    return <PageState message={t('assignments.loading')} variant="loading" />;
  }

  if (loadState.status === 'unauthenticated') {
    return <PageState title={t('assignments.title')} message={loadState.message} variant="error" action={<a href="/login">{t('login.navLink')}</a>} />;
  }

  if (loadState.status === 'error') {
    return <PageState title={t('assignments.title')} message={loadState.message} variant="error" action={<a href="/learn">{t('learner.navLink')}</a>} />;
  }

  const { assignments, total, pageSize } = loadState.data;

  const activeCount = assignments.filter((a) => a.status !== 'completed').length;
  const dueThisWeek = assignments.filter((a) => isDueThisWeek(a.dueAt)).length;
  const overdueCount = assignments.filter((a) => isOverdue(a.dueAt) && a.status !== 'completed').length;
  const completedCount = assignments.filter((a) => a.status === 'completed').length;

  return (
    <>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '22px' }}>
        <div>
          <div style={{ color: '#4f46e5', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>
            {t('learner.navLink')}
          </div>
          <h1 style={{ margin: '0', fontSize: 'clamp(28px,4vw,38px)', fontWeight: 800, color: '#172033' }}>
            {t('assignments.title')}
          </h1>
          <p style={{ margin: '10px 0 0', color: '#6b7280', lineHeight: 1.6, maxWidth: '760px', fontSize: '14px' }}>
            {t('assignments.subtitle')}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: '16px', marginBottom: '22px' }}>
        <SummaryCard value={activeCount} label={t('assignments.statsActive')} />
        <SummaryCard value={dueThisWeek} label={t('assignments.statsDueWeek')} />
        <SummaryCard value={overdueCount} label={t('assignments.statsOverdue')} />
        <SummaryCard value={completedCount} label={t('assignments.statsCompleted')} />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder={t('assignments.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '11px 14px', border: '1px solid #e3e8ef', borderRadius: '12px',
            background: '#f8fafc', outline: 'none', fontSize: '14px', minWidth: '220px',
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          style={{ padding: '11px 13px', border: '1px solid #e3e8ef', background: '#fff', borderRadius: '12px', fontSize: '14px', color: '#172033' }}
        >
          <option value="all">{t('assignments.filterAll')}</option>
          <option value="assigned">{t('assignments.filterActive')}</option>
          <option value="overdue">{t('assignments.filterOverdue')}</option>
          <option value="completed">{t('assignments.filterCompleted')}</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          style={{ padding: '11px 13px', border: '1px solid #e3e8ef', background: '#fff', borderRadius: '12px', fontSize: '14px', color: '#172033' }}
        >
          <option value="all">{t('assignments.filterAllTypes')}</option>
          <option value="course">{t('assignments.filterTypeCourse')}</option>
        </select>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          style={{ height: '42px', border: '1px solid #e3e8ef', background: '#fff', borderRadius: '12px', padding: '0 13px', fontSize: '14px', cursor: 'pointer', color: '#172033' }}
          onClick={() => { /* sort by due date */ }}
        >
          {t('assignments.sortNearest', 'Сначала ближайшие')}
        </button>
      </div>

      {/* Assignment list */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '50px 20px', background: '#fff',
          border: '1px solid #e3e8ef', borderRadius: '20px',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>⌕</div>
          <strong style={{ display: 'block', fontSize: '22px', margin: '10px 0 6px', color: '#172033' }}>
            {t('assignments.empty')}
          </strong>
          <span style={{ color: '#6b7280' }}>{t('assignments.emptyHint')}</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '14px' }}>
          {filtered.map((assignment) => {
            const effective = getEffectiveStatus(assignment);
            const statusBadge = STATUS_BADGE[effective];
            const courseTitle = getCourseTitle(assignment);
            const overdue = isOverdue(assignment.dueAt) && assignment.status !== 'completed';
            const pct = assignment.status === 'completed' ? 100 : 0;
            const dueDate = formatDueDate(assignment.dueAt);
            const href = `/learn/assignments/${encodeURIComponent(assignment.id)}`;

            return (
              <a key={assignment.id} href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
                <article style={{
                  background: '#fff', border: '1px solid #e3e8ef', borderRadius: '20px',
                  boxShadow: '0 10px 28px rgba(23,32,51,.07)', padding: '20px',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0,1fr) 210px 160px',
                  gap: '20px', alignItems: 'center',
                  transition: 'transform .16s ease, box-shadow .16s ease',
                }}>
                  {/* Main column */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <Badge bg={statusBadge.bg} color={statusBadge.color} label={t(statusBadge.labelKey)} />
                      <Badge bg={TYPE_BADGE.bg} color={TYPE_BADGE.color} label={t(TYPE_BADGE.labelKey)} />
                    </div>
                    <h2 style={{ margin: '0 0 7px', fontSize: '20px', fontWeight: 700, color: '#172033', lineHeight: 1.35 }}>
                      {courseTitle ?? t('assignments.courseLabel')}
                    </h2>
                    {(assignment.userName ?? assignment.groupName) ? (
                      <div style={{ color: '#6b7280', fontSize: '13px', marginBottom: '12px' }}>
                        {assignment.userName ?? assignment.groupName}
                      </div>
                    ) : courseTitle ? (
                      <div style={{ color: '#6b7280', fontSize: '13px', marginBottom: '12px' }}>
                        {t('assignments.courseLabel')}: {courseTitle}
                      </div>
                    ) : null}
                  </div>

                  {/* Progress column */}
                  <div style={{ minWidth: 0 }}>
                    <ProgressBar pct={pct} success={assignment.status === 'completed'} label={t('courseDetail.factsProgress')} />
                  </div>

                  {/* Due date column */}
                  <div style={{ display: 'grid', gap: '8px', justifyItems: 'end' }}>
                    <div>
                      <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: '4px' }}>
                        {assignment.status === 'completed' ? t('assignments.completedAt') : t('assignments.dueAt')}
                      </div>
                      {dueDate ? (
                        <strong style={{ fontSize: '15px', color: overdue ? '#dc2626' : '#172033' }}>
                          {dueDate}
                        </strong>
                      ) : (
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>{t('assignments.notAvailable')}</span>
                      )}
                    </div>
                    <span style={{
                      display: 'inline-block', padding: '11px 14px',
                      background: assignment.status === 'completed' ? '#fff' : '#4f46e5',
                      color: assignment.status === 'completed' ? '#172033' : '#fff',
                      borderRadius: '12px', fontSize: '14px', fontWeight: 800,
                      border: assignment.status === 'completed' ? '1px solid #e3e8ef' : 'none',
                      width: '100%', textAlign: 'center',
                    }}>
                      {assignment.status === 'completed' ? t('assignments.viewResult') : t('assignments.open')}
                    </span>
                  </div>
                </article>
              </a>
            );
          })}
        </div>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
    </>
  );
}
