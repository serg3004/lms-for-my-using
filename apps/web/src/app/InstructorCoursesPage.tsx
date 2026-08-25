import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { getCurrentUser, listCourses, listProgress, type CourseSummary, type CurrentUser } from '../shared/apiClient.js';
import { InstructorPageLayout } from '../shared/instructorLayout.js';
import { useAsyncData } from '../shared/useAsyncData.js';

type InstructorCoursesData = { user: CurrentUser; courses: CourseSummary[]; studentCounts: Map<string, number> };

type StatusFilter = 'all' | 'published' | 'draft' | 'archived';

const COLORS = {
  surface: 'var(--color-surface)',
  soft: 'var(--color-surface-muted)',
  text: 'var(--color-text)',
  muted: 'var(--color-text-muted)',
  border: 'var(--color-border)',
  primary: 'var(--color-primary)',
  primarySoft: 'var(--color-accent-muted)',
  success: 'var(--color-success)',
  successSoft: 'var(--color-success-bg)',
};

export function InstructorCoursesPage() {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { state } = useAsyncData<InstructorCoursesData>(
    async () => {
      const [user, page, { items: progressItems }] = await Promise.all([
        getCurrentUser(),
        listCourses({ pageSize: 100 }),
        listProgress({ pageSize: 100 }),
      ]);
      const studentsByCourse = new Map<string, Set<string>>();
      for (const progress of progressItems) {
        const set = studentsByCourse.get(progress.courseId) ?? new Set<string>();
        set.add(progress.userId);
        studentsByCourse.set(progress.courseId, set);
      }
      const counts = new Map<string, number>();
      for (const [courseId, students] of studentsByCourse) counts.set(courseId, students.size);
      return { user, courses: page.items, studentCounts: counts };
    },
    [t],
    { unauthenticated: t('instructor.courses.loadError'), error: t('instructor.courses.loadError') },
  );

  const filteredCourses = useMemo(() => {
    if (state.status !== 'loaded') return [];
    const q = search.trim().toLowerCase();
    return state.data.courses.filter((course) => {
      const matchesSearch = !q || course.title.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || course.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [state, search, statusFilter]);

  if (state.status === 'loading') {
    return (
      <InstructorPageLayout>
        <p role="status">{t('instructor.courses.loading')}</p>
      </InstructorPageLayout>
    );
  }

  if (state.status === 'unauthenticated' || state.status === 'notFound' || state.status === 'error') {
    return (
      <InstructorPageLayout>
        <p role="alert">{t('instructor.courses.loadError')}</p>
      </InstructorPageLayout>
    );
  }

  const { user, studentCounts } = state.data;

  return (
    <InstructorPageLayout firstName={user.firstName} lastName={user.lastName ?? undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>{t('instructor.courses.title')}</h1>
        <Link to="/instructor/courses/new" className="admin-btn admin-btn--primary">
          {t('instructor.courses.createCourse')}
        </Link>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('instructor.courses.searchPlaceholder')}
          style={{ flex: 1, minWidth: '220px', border: `1px solid ${COLORS.border}`, background: COLORS.soft, borderRadius: '12px', padding: '11px 13px' }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          style={{ border: `1px solid ${COLORS.border}`, background: COLORS.surface, borderRadius: '12px', padding: '11px 13px' }}
        >
          <option value="all">{t('instructor.courses.allStatuses')}</option>
          <option value="published">{t('instructor.courses.statusPublished')}</option>
          <option value="draft">{t('instructor.courses.statusDraft')}</option>
          <option value="archived">{t('instructor.courses.statusArchived')}</option>
        </select>
      </div>

      {filteredCourses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '16px' }}>
          <p style={{ margin: 0, color: COLORS.muted }}>
            {t('instructor.courses.emptyTitle')} <Link to="/instructor/courses/new">{t('instructor.courses.createFirstCourse')}</Link>
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {filteredCourses.map((course) => {
            const isPublished = course.status === 'published';
            const badgeBg = isPublished ? COLORS.successSoft : COLORS.primarySoft;
            const badgeColor = isPublished ? COLORS.success : COLORS.primary;
            const badgeLabel = isPublished
              ? t('instructor.courses.statusPublished')
              : course.status === 'archived'
                ? t('instructor.courses.statusArchived')
                : t('instructor.courses.statusDraft');
            const studentCount = studentCounts.get(course.id) ?? 0;

            return (
              <article
                key={course.id}
                style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '16px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                  <h2 style={{ margin: 0, fontSize: '17px', color: COLORS.text }}>{course.title}</h2>
                  <span style={{ borderRadius: '999px', padding: '6px 9px', fontSize: '11px', fontWeight: 800, background: badgeBg, color: badgeColor, whiteSpace: 'nowrap' }}>
                    {badgeLabel}
                  </span>
                </div>
                <div style={{ color: COLORS.muted, fontSize: '13px' }}>
                  {t('instructor.courses.studentsCount', { count: studentCount })} · {new Date(course.createdAt).toLocaleDateString(i18n.resolvedLanguage ?? i18n.language)}
                </div>
                <div style={{ marginTop: 'auto', display: 'flex', gap: '8px' }}>
                  <Link
                    to={`/instructor/courses/${course.id}/students`}
                    style={{ flex: 1, textAlign: 'center', border: `1px solid ${COLORS.border}`, borderRadius: '10px', padding: '8px 10px', fontSize: '13px', fontWeight: 700, color: COLORS.text, textDecoration: 'none' }}
                  >
                    {t('instructor.courses.studentsLink')}
                  </Link>
                  <Link
                    to={`/instructor/courses/${course.id}/edit`}
                    style={{ flex: 1, textAlign: 'center', border: `1px solid ${COLORS.primary}`, background: COLORS.primary, borderRadius: '10px', padding: '8px 10px', fontSize: '13px', fontWeight: 700, color: 'var(--color-on-primary)', textDecoration: 'none' }}
                  >
                    {t('instructor.courses.editLink')}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </InstructorPageLayout>
  );
}
