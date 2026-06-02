import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getCourse } from '../shared/api/courses.js';
import { ApiClientError } from '../shared/apiClient.js';
import type { CourseSummary } from '../shared/api/types.js';
import { PageState, StatusBadge } from '../shared/ui.js';

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

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const coursesAction = <a href="/learn/courses">{t('courses.navLink')}</a>;

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <PageState message={t('courseDetail.loading')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <PageState
          title={t('courseDetail.title')}
          message={loadState.message}
          variant="error"
          action={loginAction}
        />
      </main>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <main>
        <PageState
          title={t('courseDetail.title')}
          message={loadState.message}
          variant="error"
          action={coursesAction}
        />
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
          <dd>
            <StatusBadge>{loadState.course.status}</StatusBadge>
          </dd>
          <dt>{t('courseDetail.slug')}</dt>
          <dd>{loadState.course.slug}</dd>
        </dl>
      </article>
    </main>
  );
}
