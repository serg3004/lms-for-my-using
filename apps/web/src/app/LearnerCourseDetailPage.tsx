import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getCourse } from '../shared/api/courses.js';
import { listLessons } from '../shared/api/lessons.js';
import { listProgress } from '../shared/api/progress.js';
import { ApiClientError, getCurrentUser } from '../shared/apiClient.js';
import type { CourseSummary } from '../shared/api/types.js';
import { PageState } from '../shared/ui.js';

type CourseDetailLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; course: CourseSummary; totalLessons: number; completedLessons: number }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

function getLessonsHref(courseId: string) {
  return `/learn/courses/${encodeURIComponent(courseId)}/lessons`;
}

export function LearnerCourseDetailPage({ courseId }: { courseId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<CourseDetailLoadState>({ status: 'idle' });

  const loadCourseWithProgress = useCallback(async () => {
    setLoadState({ status: 'loading' });

    try {
      const [course, lessons, progressList, currentUser] = await Promise.all([
        getCourse(courseId),
        listLessons(courseId),
        listProgress(),
        getCurrentUser(),
      ]);

      const publishedLessons = lessons.filter((l) => l.status === 'published');
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
      const completedLessons = publishedLessons.filter((l) => completedLessonIds.has(l.id)).length;

      setLoadState({ status: 'loaded', course, totalLessons: publishedLessons.length, completedLessons });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setLoadState({ status: 'unauthenticated', message: t('courseDetail.sessionExpired') });
        return;
      }
      if (error instanceof ApiClientError && error.status === 404) {
        setLoadState({ status: 'notFound', message: t('courseDetail.notFound') });
        return;
      }
      setLoadState({ status: 'error', message: t('courseDetail.loadError') });
    }
  }, [courseId, t]);

  useEffect(() => {
    void loadCourseWithProgress();
  }, [loadCourseWithProgress]);

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const coursesAction = <a href="/learn/courses">{t('courses.navLink')}</a>;

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <>
        <PageState message={t('courseDetail.loading')} variant="loading" />
      </>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <>
        <PageState
          title={t('courseDetail.title')}
          message={loadState.message}
          variant="error"
          action={loginAction}
        />
      </>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <>
        <PageState
          title={t('courseDetail.title')}
          message={loadState.message}
          variant="error"
          action={coursesAction}
        />
      </>
    );
  }

  const { course, totalLessons, completedLessons } = loadState;
  const progressPercent = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

  return (
    <div className="learner-course-detail">
      <nav className="learner-breadcrumb">
        <a href="/learn/courses">{t('courses.navLink')}</a>
      </nav>

      <article className="learner-course-detail__article">
        <h1>{course.title}</h1>
        {course.description ? <p className="learner-course-detail__description">{course.description}</p> : null}

        {totalLessons > 0 ? (
          <div className="learner-course-detail__progress">
            <div className="learner-progress-summary">
              <span className="learner-progress-summary__text">
                {t('courseDetail.lessonsProgress', { completed: completedLessons, total: totalLessons })}
              </span>
              <div className="learner-progress-bar">
                <div className="learner-progress-bar__fill" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          </div>
        ) : null}

        <a className="learner-btn learner-btn--primary" href={getLessonsHref(course.id)}>
          {t('lessons.navLink')}
        </a>
      </article>
    </div>
  );
}
