import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { formatDate } from '../shared/formatDate.js';

import { getCurrentUser } from '../shared/api/auth.js';
import { getLearnerDashboardSummary } from '../shared/api/learnerDashboard.js';
import type { LearnerDashboardSummary } from '../shared/api/learnerDashboard.js';
import { getReadableTitle } from '../shared/displayLabels.js';
import { getCourseLessonsHref } from '../shared/learnerRoutes.js';
import { Card, PageState, ProgressBar, SectionHeader, StatCard, StatsGrid } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

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

function buildContinueLearning(summary: LearnerDashboardSummary): ContinueLearningItem[] {
  return summary.continueLearning.map((item) => ({
    courseId: item.courseId,
    title: getReadableTitle(item.courseTitle, item.courseId),
    completedLessons: item.completedLessons,
    totalLessons: item.totalLessons,
  }));
}

export function buildPriorityDeadlines(
  deadlines: LearnerDashboardSummary['upcomingDeadlines'],
  now = new Date(),
): DeadlineItem[] {
  const nowIso = now.toISOString();

  return deadlines.map((item) => ({
    id: item.id,
    title: getReadableTitle(item.courseTitle, item.id),
    dueAt: item.dueAt,
    isOverdue: item.dueAt < nowIso,
  }));
}

function buildRecentActivity(summary: LearnerDashboardSummary, t: TFunction): ActivityItem[] {
  return summary.recentActivity.map((item) => ({
    key: `${item.type === 'lesson_completed' ? 'lesson' : 'certificate'}-${item.id}`,
    date: item.date,
    message: t(
      item.type === 'lesson_completed'
        ? 'learner.dashboard.recentActivity.lessonCompleted'
        : 'learner.dashboard.recentActivity.certificateIssued',
      { title: getReadableTitle(item.courseTitle, item.id) },
    ),
  }));
}

export function LearnerHomePage() {
  const { t } = useTranslation();

  const { state: loadState } = useAsyncData<DashboardData>(
    async () => {
      const [user, summary] = await Promise.all([getCurrentUser(), getLearnerDashboardSummary()]);

      return {
        firstName: user.firstName,
        coursesCount: summary.coursesCount,
        pendingAssignmentsCount: summary.pendingAssignmentsCount,
        availableAssessmentsCount: summary.availableAssessmentsCount,
        certificatesCount: summary.certificatesCount,
        continueLearning: buildContinueLearning(summary),
        upcomingDeadlines: buildPriorityDeadlines(summary.upcomingDeadlines),
        recentActivity: buildRecentActivity(summary, t),
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
                        date: formatDate(item.dueAt),
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
                    {formatDate(item.date)}
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
