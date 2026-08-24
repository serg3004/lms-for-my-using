import { useTranslation } from 'react-i18next';

import { getCurrentUser } from '../shared/api/auth.js';
import { listCourses } from '../shared/api/courses.js';
import { listAssignments } from '../shared/api/assignments.js';
import { listAssessments } from '../shared/api/assessments.js';
import { listCertificates } from '../shared/api/certificates.js';
import { listLessons } from '../shared/api/lessons.js';
import { listProgress } from '../shared/api/progress.js';
import type { AssignmentSummary, CertificateSummary, CourseSummary, ProgressSummary } from '../shared/api/types.js';
import { getReadableTitle } from '../shared/displayLabels.js';
import { getCourseLessonsHref } from '../shared/learnerRoutes.js';
import { Card, PageState, ProgressBar, SectionHeader, StatCard, StatsGrid } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

type AssignmentEntry = AssignmentSummary & {
  course?: { title?: string | null } | null;
};

type CertificateEntry = CertificateSummary & {
  course?: { title?: string | null } | null;
};

type ContinueLearningItem = {
  courseId: string;
  title: string;
  completedLessons: number;
  totalLessons: number;
};

type DeadlineItem = {
  id: string;
  title: string;
  dueAt: string;
  isOverdue: boolean;
};

type ActivityItem = {
  key: string;
  date: string;
  message: string;
};

type DashboardData = {
  firstName: string;
  coursesCount: number;
  pendingAssignmentsCount: number;
  availableAssessmentsCount: number;
  certificatesCount: number;
  continueLearning: ContinueLearningItem[];
  upcomingDeadlines: DeadlineItem[];
  recentActivity: ActivityItem[];
};

async function buildContinueLearning(
  progress: ProgressSummary[],
  courses: CourseSummary[],
): Promise<ContinueLearningItem[]> {
  const latestByCourseId = new Map<string, string>();
  const completedLessonsByCourseId = new Map<string, Set<string>>();

  for (const entry of progress) {
    if (!entry.completedAt) continue;

    const current = latestByCourseId.get(entry.courseId);
    if (!current || entry.completedAt > current) {
      latestByCourseId.set(entry.courseId, entry.completedAt);
    }

    if (entry.lessonId) {
      const set = completedLessonsByCourseId.get(entry.courseId) ?? new Set<string>();
      set.add(entry.lessonId);
      completedLessonsByCourseId.set(entry.courseId, set);
    }
  }

  const topCourseIds = [...latestByCourseId.entries()]
    .sort((a, b) => (a[1] < b[1] ? 1 : -1))
    .slice(0, 3)
    .map(([courseId]) => courseId);

  const items = await Promise.all(
    topCourseIds.map(async (courseId) => {
      const course = courses.find((c) => c.id === courseId);
      const lessons = await listLessons(courseId).catch(() => []);
      const completedLessons = completedLessonsByCourseId.get(courseId)?.size ?? 0;

      return {
        courseId,
        title: getReadableTitle(course?.title, courseId),
        completedLessons,
        totalLessons: lessons.length,
      };
    }),
  );

  return items;
}

export function buildPriorityDeadlines(assignments: AssignmentEntry[], now = new Date()): DeadlineItem[] {
  const nowIso = now.toISOString();

  return assignments
    .filter((a) => a.status !== 'completed' && a.dueAt)
    .sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1))
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      title: getReadableTitle(a.course?.title, a.id),
      dueAt: a.dueAt!,
      isOverdue: a.dueAt! < nowIso,
    }));
}

function buildRecentActivity(
  progress: ProgressSummary[],
  certificates: CertificateEntry[],
  courses: CourseSummary[],
  t: (key: string, options?: Record<string, unknown>) => string,
): ActivityItem[] {
  const lessonEvents: ActivityItem[] = progress
    .filter((p) => p.completedAt)
    .map((p) => ({
      key: `lesson-${p.id}`,
      date: p.completedAt as string,
      message: t('learner.dashboard.recentActivity.lessonCompleted', {
        title: getReadableTitle(courses.find((c) => c.id === p.courseId)?.title, p.courseId),
      }),
    }));

  const certificateEvents: ActivityItem[] = certificates.map((c) => ({
    key: `certificate-${c.id}`,
    date: c.issuedAt,
    message: t('learner.dashboard.recentActivity.certificateIssued', {
      title: getReadableTitle(c.course?.title, c.courseId),
    }),
  }));

  return [...lessonEvents, ...certificateEvents].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
}

export function LearnerHomePage() {
  const { t } = useTranslation();

  const { state: loadState } = useAsyncData<DashboardData>(
    async () => {
      const [user, coursesResult, assignmentsResult, assessments, certificatesResult, progressResult] =
        await Promise.all([
          getCurrentUser(),
          listCourses({ pageSize: 100 }),
          listAssignments({ pageSize: 100 }),
          listAssessments(),
          listCertificates({ pageSize: 100 }),
          listProgress({ pageSize: 100 }),
        ]);

      const courses = coursesResult.items;
      const progress = progressResult.items;
      const assignments = assignmentsResult.items as AssignmentEntry[];
      const certificates = certificatesResult.items as CertificateEntry[];

      const continueLearning = await buildContinueLearning(progress, courses);

      return {
        firstName: user.firstName,
        coursesCount: courses.filter((c) => c.status === 'published').length,
        pendingAssignmentsCount: assignments.filter((a) => a.status !== 'completed').length,
        availableAssessmentsCount: assessments.filter((a) => a.status === 'published').length,
        certificatesCount: certificates.length,
        continueLearning,
        upcomingDeadlines: buildPriorityDeadlines(assignments),
        recentActivity: buildRecentActivity(progress, certificates, courses, t),
      };
    },
    [t],
    { unauthenticated: t('learner.sessionExpired'), error: t('learner.loadError') },
  );

  if (loadState.status === 'loading') {
    return <PageState message={t('learner.loading')} variant="loading" />;
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <PageState
        message={loadState.message}
        variant="error"
        action={<a href="/login">{t('login.navLink')}</a>}
      />
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return <PageState message={loadState.message} variant="error" />;
  }

  const { data } = loadState;

  return (
    <>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 4px', color: 'var(--color-text)' }}>
          {t('nav.home')}
        </h1>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-muted)' }}>
          {t('learner.dashboard.greeting', { name: data.firstName })}
        </p>
      </div>

      <section className="learner-dashboard__actions" aria-labelledby="learner-next-action">
        <h2 id="learner-next-action" className="learner-dashboard__eyebrow">
          {t('learner.dashboard.nextAction')}
        </h2>
        <SectionHeader title={t('learner.dashboard.continueLearning.title')} />
        {data.continueLearning.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>{t('learner.dashboard.continueLearning.empty')}</p>
        ) : (
          <div className="learner-dashboard__continue-list">
            {data.continueLearning.map((item, index) => (
              <Card key={item.courseId} className={index === 0 ? 'learner-dashboard__primary-card' : undefined}>
                <div className="learner-dashboard__continue-row">
                  <div style={{ flex: 1 }}>
                    <strong>{item.title}</strong>
                    <div style={{ marginTop: '8px' }}>
                      <ProgressBar
                        value={item.completedLessons}
                        max={Math.max(item.totalLessons, 1)}
                        label={t('learner.dashboard.continueLearning.lessonsProgress', {
                          completed: item.completedLessons,
                          total: item.totalLessons,
                        })}
                      />
                    </div>
                    <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                      {t('learner.dashboard.continueLearning.lessonsProgress', {
                        completed: item.completedLessons,
                        total: item.totalLessons,
                      })}
                    </span>
                  </div>
                  <a className={`ds-button ${index === 0 ? 'ds-button--primary' : 'ds-button--secondary'} ds-button--sm`} href={getCourseLessonsHref(item.courseId)}>
                    {t('learner.dashboard.continueLearning.action')}
                  </a>
                </div>
              </Card>
            ))}
          </div>
        )}
        <div className="learner-dashboard__deadlines">
          <SectionHeader title={t('learner.dashboard.upcomingDeadlines.title')} />
          {data.upcomingDeadlines.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)' }}>{t('learner.dashboard.upcomingDeadlines.empty')}</p>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {data.upcomingDeadlines.map((item, index) => {
                const isPrimary = data.continueLearning.length === 0 && index === 0;
                return (
                  <Card
                    compact
                    key={item.id}
                    className={`${item.isOverdue ? 'learner-dashboard__deadline--overdue ' : ''}${isPrimary ? 'learner-dashboard__primary-card' : ''}`.trim()}
                  >
                    <a
                      className={isPrimary ? 'ds-button ds-button--primary ds-button--sm' : undefined}
                      href={`/learn/assignments/${encodeURIComponent(item.id)}`}
                    >
                      {item.title}
                    </a>
                    <div className="learner-dashboard__deadline-meta">
                      {t(item.isOverdue ? 'learner.dashboard.upcomingDeadlines.overdueLabel' : 'learner.dashboard.upcomingDeadlines.dueLabel', {
                        date: new Date(item.dueAt).toLocaleDateString(),
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <div className="learner-dashboard__details">
        <div>
          <SectionHeader title={t('learner.dashboard.recentActivity.title')} />
          {data.recentActivity.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)' }}>{t('learner.dashboard.recentActivity.empty')}</p>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {data.recentActivity.map((item) => (
                <Card compact key={item.key}>
                  <div>{item.message}</div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    {new Date(item.date).toLocaleDateString()}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <section className="learner-dashboard__stats" aria-label={t('learner.dashboard.statsLabel')}>
        <StatsGrid>
          <StatCard label={t('courses.navLink')} value={data.coursesCount} />
          <StatCard label={t('assignments.navLink')} value={data.pendingAssignmentsCount} />
          <StatCard label={t('assessments.navLink')} value={data.availableAssessmentsCount} />
          <StatCard label={t('certificates.navLink')} value={data.certificatesCount} />
        </StatsGrid>
      </section>
    </>
  );
}
