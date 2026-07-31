import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listAssignments } from '../shared/api/assignments.js';
import { ApiClientError } from '../shared/apiClient.js';
import type { AssignmentSummary } from '../shared/api/types.js';
import { Pagination, PageState } from '../shared/ui.js';

type ExtendedAssignment = AssignmentSummary & {
  courseTitle?: string | null;
  course?: { title?: string | null } | null;
};

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; assignments: ExtendedAssignment[]; total: number; pageSize: number }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

type StatusFilter = 'all' | 'assigned' | 'completed' | 'overdue';

function getCourseTitle(a: ExtendedAssignment, fallback: string) {
  return a.courseTitle ?? a.course?.title ?? fallback;
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

function formatDueDate(dueAt: string | null, fallback: string) {
  if (!dueAt) return fallback;
  return new Date(dueAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getEffectiveStatus(a: ExtendedAssignment): 'overdue' | 'completed' | 'assigned' {
  if (a.status === 'completed') return 'completed';
  if (isOverdue(a.dueAt)) return 'overdue';
  return 'assigned';
}

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  overdue:   { label: 'Срочно',    bg: '#fef2f2', color: '#dc2626' },
  assigned:  { label: 'В работе',  bg: '#eef2ff', color: '#4f46e5' },
  completed: { label: 'Завершено', bg: '#e9f8f2', color: '#0f9f6e' },
};

function Badge({ type }: { type: string }) {
  const s = STATUS_BADGE[type] ?? STATUS_BADGE.assigned;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', borderRadius: '999px',
      padding: '4px 10px', fontSize: '12px', fontWeight: 700,
      background: s.bg, color: s.color,
    }}>
      {s.label}
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

export function LearnerAssignmentsPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoadState({ status: 'loading' });
      try {
        const result = await listAssignments({ page, pageSize: 20 });
        if (isMounted) setLoadState({ status: 'loaded', assignments: result.items as ExtendedAssignment[], total: result.total, pageSize: result.pageSize });
      } catch (error) {
        if (!isMounted) return;
        if (error instanceof ApiClientError && error.status === 401) {
          setLoadState({ status: 'unauthenticated', message: t('assignments.sessionExpired') });
          return;
        }
        setLoadState({ status: 'error', message: t('assignments.loadError') });
      }
    }

    void load();
    return () => { isMounted = false; };
  }, [t, page]);

  const filtered = useMemo(() => {
    const all = loadState.status === 'loaded' ? loadState.assignments : [];
    const q = search.toLowerCase();
    return all.filter((a) => {
      const title = getCourseTitle(a, '');
      const matchesSearch = !q || title.toLowerCase().includes(q);
      const effective = getEffectiveStatus(a);
      const matchesStatus = statusFilter === 'all' || effective === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [loadState, search, statusFilter]);

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return <PageState message={t('assignments.loading')} variant="loading" />;
  }

  if (loadState.status === 'unauthenticated') {
    return <PageState title={t('assignments.title')} message={loadState.message} variant="error" action={<a href="/login">{t('login.navLink')}</a>} />;
  }

  if (loadState.status === 'error') {
    return <PageState title={t('assignments.title')} message={loadState.message} variant="error" action={<a href="/learn">{t('learner.navLink')}</a>} />;
  }

  const { assignments, total, pageSize } = loadState;

  const activeCount = assignments.filter((a) => a.status !== 'completed').length;
  const dueThisWeek = assignments.filter((a) => isDueThisWeek(a.dueAt)).length;
  const overdueCount = assignments.filter((a) => isOverdue(a.dueAt) && a.status !== 'completed').length;
  const completedCount = assignments.filter((a) => a.status === 'completed').length;

  return (
    <>
      {/* Page header */}
      <div style={{ marginBottom: '22px' }}>
        <div style={{ color: '#4f46e5', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>
          {t('learner.navLink')}
        </div>
        <h1 style={{ margin: '0 0 8px', fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, color: '#172033' }}>
          {t('assignments.title')}
        </h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
          {t('assignments.subtitle', 'Следите за сроками и завершайте обязательное обучение вовремя.')}
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '22px' }}>
        <SummaryCard value={activeCount} label={t('assignments.statsActive', 'Активных назначений')} />
        <SummaryCard value={dueThisWeek} label={t('assignments.statsDueWeek', 'Срок на этой неделе')} />
        <SummaryCard value={overdueCount} label={t('assignments.statsOverdue', 'Просроченных')} />
        <SummaryCard value={completedCount} label={t('assignments.statsCompleted', 'Завершено всего')} />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder={t('assignments.searchPlaceholder', 'Найти назначение...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '10px 14px', border: '1px solid #e3e8ef', borderRadius: '12px',
            background: '#f8fafc', outline: 'none', fontSize: '14px', minWidth: '220px',
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          style={{ padding: '10px 13px', border: '1px solid #e3e8ef', background: '#fff', borderRadius: '12px', fontSize: '14px', color: '#172033' }}
        >
          <option value="all">{t('assignments.filterAll', 'Все статусы')}</option>
          <option value="assigned">{t('assignments.filterActive', 'В работе')}</option>
          <option value="overdue">{t('assignments.filterOverdue', 'Срочные')}</option>
          <option value="completed">{t('assignments.filterCompleted', 'Завершённые')}</option>
        </select>
      </div>

      {/* Assignment list */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '50px 20px', background: '#fff',
          border: '1px solid #e3e8ef', borderRadius: '20px',
        }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>⌕</div>
          <strong style={{ display: 'block', fontSize: '18px', marginBottom: '6px', color: '#172033' }}>
            {t('assignments.empty')}
          </strong>
          <span style={{ color: '#6b7280', fontSize: '14px' }}>
            {t('assignments.emptyHint', 'Измените поиск или выбранные фильтры.')}
          </span>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '14px' }}>
          {filtered.map((assignment) => {
            const effective = getEffectiveStatus(assignment);
            const courseTitle = getCourseTitle(assignment, t('assignments.courseId', 'Курс'));
            const overdue = isOverdue(assignment.dueAt) && assignment.status !== 'completed';
            const href = `/learn/assignments/${encodeURIComponent(assignment.id)}`;

            return (
              <a
                key={assignment.id}
                href={href}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <article style={{
                  background: '#fff', border: '1px solid #e3e8ef', borderRadius: '20px',
                  boxShadow: '0 10px 28px rgba(23,32,51,.07)', padding: '20px',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0,1fr) 180px',
                  gap: '20px', alignItems: 'center',
                  transition: 'transform .16s ease, box-shadow .16s ease',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      <Badge type={effective} />
                    </div>
                    <h2 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 700, color: '#172033', lineHeight: 1.35 }}>
                      {courseTitle}
                    </h2>
                    <div style={{ color: '#6b7280', fontSize: '13px' }}>
                      {t('assignments.courseLabel', 'Курс')}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    {assignment.dueAt ? (
                      <>
                        <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: '4px' }}>
                          {assignment.status === 'completed'
                            ? t('assignments.completedAt', 'Завершено')
                            : t('assignments.dueAt')}
                        </div>
                        <strong style={{ fontSize: '14px', color: overdue ? '#dc2626' : '#172033' }}>
                          {formatDueDate(assignment.dueAt, t('assignments.notAvailable'))}
                        </strong>
                      </>
                    ) : (
                      <span style={{ color: '#6b7280', fontSize: '13px' }}>{t('assignments.notAvailable')}</span>
                    )}
                    <div style={{ marginTop: '12px' }}>
                      <span style={{
                        display: 'inline-block', padding: '8px 16px',
                        background: assignment.status === 'completed' ? '#f8fafc' : '#4f46e5',
                        color: assignment.status === 'completed' ? '#172033' : '#fff',
                        borderRadius: '12px', fontSize: '13px', fontWeight: 700,
                        border: assignment.status === 'completed' ? '1px solid #e3e8ef' : 'none',
                      }}>
                        {assignment.status === 'completed'
                          ? t('assignments.viewResult', 'Результат')
                          : t('assignments.open', 'Открыть')}
                      </span>
                    </div>
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
