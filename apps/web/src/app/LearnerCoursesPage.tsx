import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, CourseSummary, listCourses } from '../shared/apiClient.js';
import { getAuthToken } from '../shared/authToken.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';

type CoursesLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; courses: CourseSummary[] }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

function formatCourseDescription(course: CourseSummary) {
  return course.description?.trim() || course.slug;
}

function getCourseDetailHref(course: CourseSummary) {
  return `/learn/courses/${encodeURIComponent(course.id)}`;
}

export function LearnerCoursesPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<CoursesLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadCourses() {
      if (!getAuthToken()) {
        setLoadState({
          status: 'unauthenticated',
          message: t('courses.authRequired'),
        });
        return;
      }

      setLoadState({ status: 'loading' });

      try {
        const courses = await listCourses();

        if (isMounted) {
          setLoadState({ status: 'loaded', courses });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 401) {
          setLoadState({
            status: 'unauthenticated',
            message: t('courses.sessionExpired'),
          });
          return;
        }

        setLoadState({
          status: 'error',
          message: t('courses.loadError'),
        });
      }
    }

    void loadCourses();

    return () => {
      isMounted = false;
    };
  }, [t]);

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <PageState message={t('courses.loading')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <PageState
          title={t('courses.title')}
          message={loadState.message}
          variant="error"
          action={<a href="/login">{t('login.navLink')}</a>}
        />
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main>
        <PageState title={t('courses.title')} message={loadState.message} variant="error" />
      </main>
    );
  }

  return (
    <main>
      <h1>{t('courses.title')}</h1>
      <nav>
        <a href="/learn">{t('learner.navLink')}</a>
      </nav>

      {loadState.courses.length === 0 ? (
        <EmptyState message={t('courses.empty')} />
      ) : (
        <ul>
          {loadState.courses.map((course) => (
            <li key={course.id}>
              <article>
                <h2>
                  <a href={getCourseDetailHref(course)}>{course.title}</a>
                </h2>
                <p>{formatCourseDescription(course)}</p>
                <p>
                  {t('courses.status')}: <StatusBadge>{course.status}</StatusBadge>
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
