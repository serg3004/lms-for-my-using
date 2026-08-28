import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getCourseCompletion, listCourses } from '../shared/api/courses.js';
import type { CourseCompletion, CourseSummary } from '../shared/api/types.js';
import { PageState } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

const EMPTY_COMPLETION: Pick<CourseCompletion, 'totalLessons' | 'completedLessons' | 'percentage' | 'isCompleted'> = {
  totalLessons: 0,
  completedLessons: 0,
  percentage: 0,
  isCompleted: false,
};

const COVER_GRADIENTS = [
  'linear-gradient(135deg, #4338ca 0%, #0ea5e9 100%)',
  'linear-gradient(135deg, #047857 0%, #22c55e 100%)',
  'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
  'linear-gradient(135deg, #ea580c 0%, #db2777 100%)',
  'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
  'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
];

function coverGradient(index: number) {
  return COVER_GRADIENTS[index % COVER_GRADIENTS.length];
}

type StatusFilter = 'all' | 'active' | 'completed';
type SortMode = 'recent' | 'progress' | 'title';

type CourseWithProgress = CourseSummary & {
  totalLessons: number;
  completedLessons: number;
  percentage: number;
  isCompleted: boolean;
};

type CoursesData = { courses: CourseWithProgress[]; total: number; pageSize: number };

export function mergeCourseProgress(
  courses: CourseSummary[],
  completions: ReadonlyArray<Pick<CourseCompletion, 'totalLessons' | 'completedLessons' | 'percentage' | 'isCompleted'>>,
): CourseWithProgress[] {
  return courses.map((course, index) => ({
    ...course,
    totalLessons: completions[index]!.totalLessons,
    completedLessons: completions[index]!.completedLessons,
    percentage: completions[index]!.percentage,
    isCompleted: completions[index]!.isCompleted,
  }));
}

const SEL_STYLE: React.CSSProperties = {
  border: '1px solid #e3e8ef',
  background: '#fff',
  borderRadius: '12px',
  padding: '11px 13px',
  fontSize: '14px',
  cursor: 'pointer',
  color: '#172033',
};

export function LearnerCoursesPage() {
  const { t } = useTranslation();
  const { state: loadState } = useAsyncData<CoursesData>(
    async () => {
      const result = await listCourses({ page: 1, pageSize: 100 });
      const completions = await Promise.all(
        result.items.map((course) =>
          getCourseCompletion(course.id).catch(() => EMPTY_COMPLETION),
        ),
      );
      const courses = mergeCourseProgress(result.items, completions);
      return { courses, total: result.total, pageSize: result.pageSize };
    },
    [t],
    { unauthenticated: t('courses.sessionExpired'), error: t('courses.loadError') },
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');

  if (loadState.status === 'loading') {
    return <PageState message={t('courses.loading')} variant="loading" />;
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <PageState
        title={t('courses.title')}
        message={loadState.message}
        variant="error"
        action={<a href="/login">{t('login.navLink')}</a>}
      />
    );
  }

  if (loadState.status === 'error' || loadState.status === 'notFound') {
    return <PageState title={t('courses.title')} message={loadState.message} variant="error" />;
  }

  const { courses } = loadState.data;
  const activeCount = courses.filter((c) => !c.isCompleted).length;
  const completedCount = courses.filter((c) => c.isCompleted).length;
  const avgProgress =
    courses.length > 0 ? Math.round(courses.reduce((sum, c) => sum + c.percentage, 0) / courses.length) : 0;

  let filtered = courses.filter((c) => {
    if (statusFilter === 'active') return !c.isCompleted;
    if (statusFilter === 'completed') return c.isCompleted;
    return true;
  });

  if (sortMode === 'title') {
    filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  } else if (sortMode === 'progress') {
    filtered = [...filtered].sort((a, b) => b.percentage - a.percentage);
  }

  return (
    <>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '22px',
          gap: '20px',
        }}
      >
        <div>
          <div
            style={{
              color: '#4f46e5',
              fontSize: '12px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '8px',
            }}
          >
            {t('learner.navLink')}
          </div>
          <h1 style={{ margin: 0, fontSize: '38px', fontWeight: 800, color: '#172033', lineHeight: 1.2 }}>
            {t('courses.title')}
          </h1>
          <p style={{ margin: '10px 0 0', color: '#6b7280', fontSize: '15px' }}>{t('courses.subtitle')}</p>
        </div>
        <button
          style={{
            border: '1px solid #4f46e5',
            background: '#4f46e5',
            color: '#fff',
            borderRadius: '12px',
            padding: '12px 16px',
            fontWeight: 800,
            fontSize: '14px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {t('courses.openCatalog')}
        </button>
      </div>

      {/* Stats row */}
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '22px' }}
      >
        {[
          { value: activeCount, label: t('courses.statsActive') },
          { value: completedCount, label: t('courses.statsCompleted') },
          { value: `${avgProgress}%`, label: t('courses.statsAvgProgress') },
          { value: courses.length, label: t('courses.statsTotal') },
        ].map((s, i) => (
          <div
            key={i}
            style={{ background: '#fff', border: '1px solid #e3e8ef', borderRadius: '14px', padding: '18px' }}
          >
            <strong style={{ display: 'block', fontSize: '28px', color: '#172033' }}>{s.value}</strong>
            <span style={{ color: '#6b7280', fontSize: '13px' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div
        style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '18px', alignItems: 'center' }}
      >
        <select
          style={SEL_STYLE}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="all">{t('courses.filterAll')}</option>
          <option value="active">{t('courses.filterActive')}</option>
          <option value="completed">{t('courses.filterCompleted')}</option>
        </select>
        <select style={{ ...SEL_STYLE, color: '#9ca3af', cursor: 'default' }} disabled>
          <option>{t('courses.filterAllCategories')}</option>
        </select>
        <div style={{ flex: 1 }} />
        <select
          style={SEL_STYLE}
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
        >
          <option value="recent">{t('courses.sortRecent')}</option>
          <option value="progress">{t('courses.sortProgress')}</option>
          <option value="title">{t('courses.sortTitle')}</option>
        </select>
      </div>

      {/* Course grid */}
      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '50px',
            background: '#fff',
            border: '1px solid #e3e8ef',
            borderRadius: '20px',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>⌕</div>
          <strong style={{ fontSize: '16px', color: '#172033' }}>{t('courses.empty')}</strong>
          <p style={{ color: '#6b7280', margin: '8px 0 0' }}>{t('courses.emptyHint')}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
          {filtered.map((course, index) => {
            const isCompleted = course.isCompleted;
            const pct = course.percentage;
            const lessonsCount = course.totalLessons;
            const remainingLessons = Math.max(lessonsCount - course.completedLessons, 0);

            const badgeBg = isCompleted ? '#e9f8f2' : '#eef2ff';
            const badgeColor = isCompleted ? '#0f9f6e' : '#4f46e5';
            const badgeLabel = isCompleted ? t('courses.statusCompleted') : t('courses.statusActive');

            return (
              <article
                key={course.id}
                style={{
                  background: '#fff',
                  border: '1px solid #e3e8ef',
                  borderRadius: '20px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: '420px',
                  boxShadow: '0 10px 28px rgba(23,32,51,.07)',
                }}
              >
                {/* Cover */}
                <div
                  style={{
                    minHeight: '180px',
                    padding: '22px',
                    color: '#fff',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    background: coverGradient(index),
                  }}
                >
                  <strong style={{ fontSize: '23px', lineHeight: 1.3, fontWeight: 800 }}>
                    {course.title}
                  </strong>
                </div>

                {/* Body */}
                <div
                  style={{
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    flex: 1,
                  }}
                >
                  {/* Badges */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                    <span
                      style={{
                        borderRadius: '999px',
                        padding: '7px 10px',
                        fontSize: '12px',
                        fontWeight: 800,
                        background: badgeBg,
                        color: badgeColor,
                      }}
                    >
                      {badgeLabel}
                    </span>
                    {lessonsCount > 0 && (
                      <span
                        style={{
                          borderRadius: '999px',
                          padding: '7px 10px',
                          fontSize: '12px',
                          fontWeight: 800,
                          background: '#eef2ff',
                          color: '#4f46e5',
                        }}
                      >
                        {lessonsCount} {t('courses.lessons')}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h2 style={{ fontSize: '20px', margin: 0, color: '#172033', fontWeight: 800 }}>
                    {course.title}
                  </h2>

                  {/* Description */}
                  {course.description && (
                    <p style={{ margin: 0, color: '#6b7280', fontSize: '14px', lineHeight: 1.5 }}>
                      {course.description.length > 120
                        ? `${course.description.slice(0, 120)}…`
                        : course.description}
                    </p>
                  )}

                  {/* Meta grid */}
                  {lessonsCount > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div
                        style={{ padding: '11px', background: '#f8fafc', borderRadius: '12px' }}
                      >
                        <span
                          style={{ display: 'block', color: '#6b7280', fontSize: '11px', marginBottom: '4px' }}
                        >
                          {t('courses.lessons')}
                        </span>
                        <strong style={{ fontSize: '14px', color: '#172033' }}>{lessonsCount}</strong>
                      </div>
                      <div
                        style={{ padding: '11px', background: '#f8fafc', borderRadius: '12px' }}
                      >
                        <span
                          style={{ display: 'block', color: '#6b7280', fontSize: '11px', marginBottom: '4px' }}
                        >
                          {t('courses.remaining')}
                        </span>
                        <strong style={{ fontSize: '14px', color: '#172033' }}>
                          {remainingLessons} {t('courses.lessons')}
                        </strong>
                      </div>
                    </div>
                  )}

                  {/* Progress bar */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        color: '#6b7280',
                        fontSize: '12px',
                        marginBottom: '6px',
                      }}
                    >
                      <span>{t('courses.progress')}</span>
                      <strong style={{ color: '#172033' }}>{pct}%</strong>
                    </div>
                    <div
                      style={{
                        height: '9px',
                        background: '#edf0f5',
                        borderRadius: '999px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: isCompleted
                            ? '#0f9f6e'
                            : 'linear-gradient(90deg, #4f46e5, #7c3aed)',
                          borderRadius: '999px',
                        }}
                      />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ marginTop: 'auto', display: 'flex', gap: '10px' }}>
                    <a
                      href={`/learn/courses/${encodeURIComponent(course.id)}`}
                      style={{
                        flex: 1,
                        border: '1px solid #e3e8ef',
                        background: '#fff',
                        borderRadius: '12px',
                        padding: '11px 14px',
                        fontWeight: 800,
                        fontSize: '14px',
                        textAlign: 'center',
                        textDecoration: 'none',
                        color: '#172033',
                      }}
                    >
                      {t('courses.details')}
                    </a>
                    <a
                      href={`/learn/courses/${encodeURIComponent(course.id)}`}
                      style={{
                        flex: 1,
                        border: '1px solid #4f46e5',
                        background: '#4f46e5',
                        borderRadius: '12px',
                        padding: '11px 14px',
                        fontWeight: 800,
                        fontSize: '14px',
                        textAlign: 'center',
                        textDecoration: 'none',
                        color: '#fff',
                      }}
                    >
                      {isCompleted ? t('courses.certificate') : t('courses.continue')}
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
