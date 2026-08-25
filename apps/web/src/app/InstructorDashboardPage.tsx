import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { getCurrentUser, listCourses, listProgress, type CourseSummary, type CurrentUser } from '../shared/apiClient.js';
import type { ProgressSummary } from '../shared/api/types.js';
import { InstructorPageLayout } from '../shared/instructorLayout.js';
import { useAsyncData } from '../shared/useAsyncData.js';

type Stats = {
  total: number;
  published: number;
  draft: number;
  studentsEnrolled: number;
  completionPercent: number;
};

type InstructorDashboardData = {
  user: CurrentUser;
  stats: Stats;
  popularCourseTitle: string | null;
  completionsToday: number;
};

export function computeStats(courses: CourseSummary[], progressItems: { userId: string; status: string }[]): Stats {
  const published = courses.filter((c) => c.status === 'published').length;
  const draft = courses.filter((c) => c.status !== 'published').length;
  const studentsEnrolled = new Set(progressItems.map((p) => p.userId)).size;
  const completed = progressItems.filter((p) => p.status === 'completed').length;
  const completionPercent = progressItems.length > 0 ? Math.round((completed / progressItems.length) * 100) : 0;
  return { total: courses.length, published, draft, studentsEnrolled, completionPercent };
}

function findPopularCourseTitle(courses: CourseSummary[], progressItems: ProgressSummary[]): string | null {
  const studentsByCourse = new Map<string, Set<string>>();
  for (const p of progressItems) {
    const set = studentsByCourse.get(p.courseId) ?? new Set<string>();
    set.add(p.userId);
    studentsByCourse.set(p.courseId, set);
  }
  let bestCourseId: string | null = null;
  let bestCount = 0;
  for (const [courseId, students] of studentsByCourse) {
    if (students.size > bestCount) {
      bestCount = students.size;
      bestCourseId = courseId;
    }
  }
  return bestCourseId ? courses.find((c) => c.id === bestCourseId)?.title ?? null : null;
}

function countCompletionsToday(progressItems: ProgressSummary[]): number {
  const today = new Date().toDateString();
  return progressItems.filter((p) => p.completedAt && new Date(p.completedAt).toDateString() === today).length;
}

export function InstructorDashboardPage() {
  const { t } = useTranslation();

  const { state } = useAsyncData<InstructorDashboardData>(
    async () => {
      const [user, coursesPage, progressPage] = await Promise.all([
        getCurrentUser(),
        listCourses({ pageSize: 100 }),
        listProgress({ pageSize: 100 }),
      ]);

      return {
        user,
        stats: computeStats(coursesPage.items, progressPage.items),
        popularCourseTitle: findPopularCourseTitle(coursesPage.items, progressPage.items),
        completionsToday: countCompletionsToday(progressPage.items),
      };
    },
    [t],
    { unauthenticated: t('instructor.dashboard.loadError'), error: t('instructor.dashboard.loadError') },
  );

  if (state.status === 'loading') {
    return (
      <InstructorPageLayout>
        <p role="status">{t('instructor.dashboard.loading')}</p>
      </InstructorPageLayout>
    );
  }

  if (state.status === 'unauthenticated' || state.status === 'notFound' || state.status === 'error') {
    return (
      <InstructorPageLayout>
        <p role="alert">{t('instructor.dashboard.loadError')}</p>
      </InstructorPageLayout>
    );
  }

  const { user, stats, popularCourseTitle, completionsToday } = state.data;

  return (
    <InstructorPageLayout firstName={user.firstName} lastName={user.lastName ?? undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>{t('instructor.dashboard.title')}</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)' }}>{t('instructor.dashboard.subtitle')}</p>
        </div>
        <Link to="/instructor/courses/new" className="admin-btn admin-btn--primary">
          {t('instructor.dashboard.createCourse')}
        </Link>
      </div>

      <section className="admin-content-grid" style={{ marginTop: '1.5rem' }}>
        <StatCard label={t('instructor.dashboard.statsCourses')} value={stats.total} />
        <StatCard label={t('instructor.dashboard.statsStudents')} value={stats.studentsEnrolled} />
        <StatCard label={t('instructor.dashboard.statsCompletion')} value={`${stats.completionPercent}%`} />
        <StatCard label={t('instructor.dashboard.statsDrafts')} value={stats.draft} />
      </section>

      <section className="admin-content-grid" style={{ marginTop: '1rem' }}>
        <div className="admin-card">
          <h3 style={{ margin: '0 0 8px' }}>{t('instructor.dashboard.popularCourseTitle')}</h3>
          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>{popularCourseTitle ?? t('instructor.dashboard.popularCourseEmpty')}</p>
        </div>
        <div className="admin-card">
          <h3 style={{ margin: '0 0 8px' }}>{t('instructor.dashboard.recentActivityTitle')}</h3>
          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
            {completionsToday > 0
              ? t('instructor.dashboard.recentActivityCount', { count: completionsToday })
              : t('instructor.dashboard.recentActivityEmpty')}
          </p>
        </div>
        <div className="admin-card">
          <h3 style={{ margin: '0 0 8px' }}>{t('instructor.dashboard.draftsTitle')}</h3>
          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
            {stats.draft > 0
              ? t('instructor.dashboard.draftsCount', { count: stats.draft })
              : t('instructor.dashboard.draftsEmpty')}
          </p>
        </div>
      </section>
    </InstructorPageLayout>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="admin-card" style={{ textAlign: 'center' }}>
      <p style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>{value}</p>
      <p style={{ margin: '0.25rem 0 0' }}>{label}</p>
    </div>
  );
}
