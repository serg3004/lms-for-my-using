import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listCourses } from '../shared/api/courses.js';
import { ApiClientError } from '../shared/apiClient.js';
import type { CourseSummary } from '../shared/api/types.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';

type CoursesLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; courses: CourseSummary[] }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

type LearnerCourseListProps = {
  courses: CourseSummary[];
  emptyMessage: string;
  statusLabel: string;
};

function formatCourseDescription(course: CourseSummary) {
  return course.description?.trim() || course.slug;
}

function getCourseDetailHref(course: CourseSummary) {
  return `/learn/courses/${encodeURIComponent(course.id)}`;
}

function LearnerCourseList({ courses, emptyMessage, statusLabel }: LearnerCourseListProps) {
  if (courses.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <ul>
      {courses.map((course) => (
        <li key={course.id}>
          <article>
            <h2>
              <a href={getCourseDetailHref(course)}>{course.title}</a>
            </h2>
            <p>{formatCourseDescription(course)}</p>
            <p>
              {statusLabel}: <StatusBadge>{course.status}</StatusBadge>
            </p>
          </article>
        </li>
      ))}
    </ul>
  );
}

export function LearnerCoursesPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<CoursesLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadCourses() {
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

      <LearnerCourseList
        courses={loadState.courses}
        emptyMessage={t('courses.empty')}
        statusLabel={t('courses.status')}
      />
    </main>
  );
}
