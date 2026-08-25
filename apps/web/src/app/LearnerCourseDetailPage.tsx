import { useTranslation } from 'react-i18next';
import { formatDate } from '../shared/formatDate.js';

import { listAssignments } from '../shared/api/assignments.js';
import { getCourse } from '../shared/api/courses.js';
import { listLessons } from '../shared/api/lessons.js';
import { listProgress } from '../shared/api/progress.js';
import type { CourseSummary, LessonSummary } from '../shared/api/types.js';
import { getCurrentUser } from '../shared/apiClient.js';
import { PageState } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

type LearnerCourseDetailData = {
  course: CourseSummary;
  lessons: LessonSummary[];
  completedLessonIds: Set<string>;
  dueAt: string | null;
};

function formatDueAt(dueAt: string): string {
  return formatDate(dueAt, undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDuration(minutes: number | null, h: string, m: string, none: string): string {
  if (!minutes) return none;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins} ${m}`;
  if (mins === 0) return `${hrs} ${h}`;
  return `${hrs} ${h} ${mins} ${m}`;
}

export function LearnerCourseDetailPage({ courseId }: { courseId: string }) {
  const { t } = useTranslation();

  const { state: loadState } = useAsyncData<LearnerCourseDetailData>(
    async () => {
      const [course, lessonsAll, { items: progressList }, assignmentsRes, currentUser] = await Promise.all([
        getCourse(courseId),
        listLessons(courseId),
        listProgress({ pageSize: 200 }),
        listAssignments({ pageSize: 50 }).catch(() => ({ items: [] as import('../shared/api/types.js').AssignmentSummary[] })),
        getCurrentUser(),
      ]);
      const assignments = assignmentsRes.items;

      const lessons = lessonsAll
        .filter((l) => l.status === 'published')
        .sort((a, b) => a.order - b.order);

      const completedLessonIds = new Set(
        progressList
          .filter(
            (p) =>
              p.courseId === courseId &&
              p.userId === currentUser.id &&
              p.status === 'completed' &&
              p.lessonId !== null,
          )
          .map((p) => p.lessonId as string),
      );

      const dueAt = assignments.find((a) => a.courseId === courseId)?.dueAt ?? null;

      return { course, lessons, completedLessonIds, dueAt };
    },
    [courseId, t],
    { unauthenticated: t('courseDetail.sessionExpired'), error: t('courseDetail.loadError') },
  );

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const coursesAction = <a href="/learn/courses">{t('courses.navLink')}</a>;

  if (loadState.status === 'loading') {
    return <PageState message={t('courseDetail.loading')} variant="loading" />;
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <PageState
        title={t('courseDetail.title')}
        message={loadState.message}
        variant="error"
        action={loginAction}
      />
    );
  }

  if (loadState.status === 'error' || loadState.status === 'notFound') {
    return (
      <PageState
        title={t('courseDetail.title')}
        message={loadState.message}
        variant="error"
        action={coursesAction}
      />
    );
  }

  const { course, lessons, completedLessonIds, dueAt } = loadState.data;
  const totalLessons = lessons.length;
  const completedLessons = lessons.filter((l) => completedLessonIds.has(l.id)).length;
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const firstIncomplete = lessons.find((l) => !completedLessonIds.has(l.id));
  const continueHref = firstIncomplete
    ? `/learn/lessons/${encodeURIComponent(firstIncomplete.id)}`
    : `/learn/courses/${encodeURIComponent(courseId)}/lessons`;

  const allDone = totalLessons > 0 && completedLessons === totalLessons;
  const noneStarted = completedLessons === 0;

  let heroTitle: string;
  let heroText: string;
  if (allDone) {
    heroTitle = t('courseDetail.heroTitleDone');
    heroText = t('courseDetail.heroTextDone', { total: totalLessons });
  } else if (noneStarted || !firstIncomplete) {
    heroTitle = t('courseDetail.heroTitleStart');
    heroText = t('courseDetail.heroTextStart');
  } else {
    heroTitle = t('courseDetail.heroTitle', { lesson: firstIncomplete.title });
    heroText = t('courseDetail.heroText', { completed: completedLessons, total: totalLessons });
  }

  return (
    <div>
      <nav className="learner-breadcrumb">
        <a href="/learn/courses">{t('courses.navLink')}</a>
        <span aria-hidden="true"> / </span>
        <span>{course.title}</span>
      </nav>

      <section className="lcd-hero">
        <div className="lcd-hero__text">
          <p className="lcd-eyebrow">{t('courseDetail.eyebrow')}</p>
          <h2>{heroTitle}</h2>
          <p className="lcd-hero__subtext">{heroText}</p>
        </div>
        <div className="lcd-hero__card">
          <div className="lcd-hero__percent">{progressPercent}%</div>
          <div className="lcd-hero__bar-label">{t('courseDetail.progressLabel')}</div>
          <div className="lcd-hero__bar">
            <div className="lcd-hero__bar-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </section>

      <div className="lcd-layout">
        <div className="lcd-main">
          <div className="ds-card" style={{ padding: '28px 32px' }}>
            <h3 className="lcd-section-title">{t('courseDetail.aboutTitle')}</h3>

            <div className="lcd-facts">
              <div className="lcd-fact">
                <div className="lcd-fact__value">{totalLessons}</div>
                <div className="lcd-fact__label">{t('courseDetail.factsLessons')}</div>
              </div>
              <div className="lcd-fact">
                <div className="lcd-fact__value">
                  {formatDuration(course.durationMinutes, t('courseDetail.durationH'), t('courseDetail.durationMin'), t('courseDetail.factsNoDuration'))}
                </div>
                <div className="lcd-fact__label">{t('courseDetail.factsDuration')}</div>
              </div>
              <div className="lcd-fact">
                <div className="lcd-fact__value">{course.category ?? t('courseDetail.factsNoDuration')}</div>
                <div className="lcd-fact__label">{t('courseDetail.factsLevel')}</div>
              </div>
            </div>

            {course.description ? (
              <p className="lcd-description" style={{ marginTop: '20px' }}>
                {course.description}
              </p>
            ) : null}
          </div>

          {lessons.length > 0 ? (
            <div className="ds-card" style={{ padding: '28px 32px' }}>
              <h3 className="lcd-section-title">{t('courseDetail.programTitle')}</h3>
              <div className="lcd-lessons">
                {lessons.map((lesson, idx) => {
                  const isDone = completedLessonIds.has(lesson.id);
                  const isCurrent = !isDone && lesson === firstIncomplete;
                  return (
                    <div key={lesson.id} className="lcd-lesson">
                      <div
                        className={`lcd-lesson__index${isDone ? ' lcd-lesson__index--done' : isCurrent ? ' lcd-lesson__index--current' : ''}`}
                      >
                        {idx + 1}
                      </div>
                      <div className="lcd-lesson__title">{lesson.title}</div>
                      {isDone ? (
                        <span className="lcd-badge lcd-badge--done">{t('courseDetail.statusDone')}</span>
                      ) : isCurrent ? (
                        <span className="lcd-badge lcd-badge--current">{t('courseDetail.statusCurrent')}</span>
                      ) : (
                        <span />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="lcd-side">
          <div className="ds-card" style={{ padding: '24px' }}>
            <h3 className="lcd-section-title">{t('courseDetail.detailsTitle')}</h3>
            <div className="info-row">
              <span className="info-row__label">{t('courseDetail.detailsAuthor')}</span>
              <span>{t('courseDetail.detailsNoAuthor')}</span>
            </div>
            <div className="info-row">
              <span className="info-row__label">{t('courseDetail.detailsDueAt')}</span>
              <span>{dueAt ? formatDueAt(dueAt) : t('courseDetail.detailsNoDueAt')}</span>
            </div>
            <div className="info-row">
              <span className="info-row__label">{t('courseDetail.detailsCertificate')}</span>
              <span>{t('courseDetail.detailsCertificateValue')}</span>
            </div>
          </div>

          <div className="ds-card lcd-actions" style={{ padding: '24px' }}>
            <a className="learner-btn learner-btn--primary" href={continueHref}>
              {t('courseDetail.continueLearning')}
            </a>
            <a
              className="learner-btn learner-btn--secondary"
              href={`/learn/courses/${encodeURIComponent(courseId)}/lessons`}
            >
              {t('lessons.navLink')}
            </a>
            <a className="learner-btn learner-btn--secondary" href="/learn/courses">
              {t('courseDetail.backToCourses')}
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
