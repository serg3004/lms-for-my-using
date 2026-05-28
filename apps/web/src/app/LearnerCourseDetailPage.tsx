import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, CourseSummary, getCourse } from '../shared/apiClient.js';
import { getAuthToken } from '../shared/authToken.js';

type CourseDetailLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; course: CourseSummary }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

function formatCourseDescription(course: CourseSummary) {
  return course.description?.trim() || course.slug;
}

function getLessonsHref(courseId: string) {
  return `/learn/courses/${encodeURIComponent(courseId)}/lessons`;
}

export function LearnerCourseDetailPage({ courseId }: { courseId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<CourseDetailLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadCourse() {
      if (!getAuthToken()) {
        setLoadState({
          status: 'unauthenticated',
          message: t('courseDetail.authRequired'),
        });
        return;
      }

      setLoadState({ status: 'loading' });

      try {
        const course = await getCourse(courseId);

        if (isMounted) {
          setLoadState({ status: 'loaded', course });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 401) {
          setLoadState({
            status: 'unauthenticated',
            message: t('courseDetail.sessionExpired'),
          });
          return;
        }

        if (error instanceof ApiClientError && error.status === 404) {
          setLoadState({
            status: 'notFound',
            message: t('courseDetail.notFound'),
          });
          return;
        }

        setLoadState({
          status: 'error',
          message: t('courseDetail.loadError'),
        });
      }
    }

    void loadCourse();

    return () => {
      isMounted = false;
    };
  }, [courseId, t]);

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <p>{t('courseDetail.loading')}</p>
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <h1>{t('courseDetail.title')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/login">{t('login.navLink')}</a>
      </main>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <main>
        <h1>{t('courseDetail.title')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/learn/courses">{t('courses.navLink')}</a>
      </main>
    );
  }

  return (
    <main>
      <nav>
        <a href="/learn/courses">{t('courses.navLink')}</a>
        <a href={getLessonsHref(loadState.course.id)}>{t('lessons.navLink')}</a>
      </nav>

      <article>
        <h1>{loadState.course.title}</h1>
        <p>{formatCourseDescription(loadState.course)}</p>
        <dl>
          <dt>{t('courseDetail.status')}</dt>
          <dd>{loadState.course.status}</dd>
          <dt>{t('courseDetail.slug')}</dt>
          <dd>{loadState.course.slug}</dd>
        </dl>
      </article>
    </main>
  );
}
