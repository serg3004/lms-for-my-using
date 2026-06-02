import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listLessons } from '../shared/api/lessons.js';
import { ApiClientError } from '../shared/apiClient.js';
import type { LessonSummary } from '../shared/api/types.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';

type LessonsLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; lessons: LessonSummary[] }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

function formatLessonDescription(lesson: LessonSummary) {
  return lesson.description?.trim() || lesson.slug;
}

function getLessonDetailHref(lesson: LessonSummary) {
  return `/learn/lessons/${encodeURIComponent(lesson.id)}`;
}

function getCourseDetailHref(courseId: string) {
  return `/learn/courses/${encodeURIComponent(courseId)}`;
}

export function LearnerLessonsPage({ courseId }: { courseId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LessonsLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadLessons() {
      setLoadState({ status: 'loading' });

      try {
        const lessons = await listLessons(courseId);

        if (isMounted) {
          setLoadState({ status: 'loaded', lessons });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 401) {
          setLoadState({
            status: 'unauthenticated',
            message: t('lessons.sessionExpired'),
          });
          return;
        }

        if (error instanceof ApiClientError && error.status === 404) {
          setLoadState({
            status: 'notFound',
            message: t('lessons.notFound'),
          });
          return;
        }

        setLoadState({
          status: 'error',
          message: t('lessons.loadError'),
        });
      }
    }

    void loadLessons();

    return () => {
      isMounted = false;
    };
  }, [courseId, t]);

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const courseAction = <a href={getCourseDetailHref(courseId)}>{t('courseDetail.title')}</a>;

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <PageState message={t('lessons.loading')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <PageState title={t('lessons.title')} message={loadState.message} variant="error" action={loginAction} />
      </main>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <main>
        <PageState title={t('lessons.title')} message={loadState.message} variant="error" action={courseAction} />
      </main>
    );
  }

  return (
    <main>
      <h1>{t('lessons.title')}</h1>
      <nav>
        <a href={getCourseDetailHref(courseId)}>{t('courseDetail.title')}</a>
      </nav>

      {loadState.lessons.length === 0 ? (
        <EmptyState message={t('lessons.empty')} />
      ) : (
        <ol>
          {loadState.lessons.map((lesson) => (
            <li key={lesson.id}>
              <article>
                <h2>
                  <a href={getLessonDetailHref(lesson)}>{lesson.title}</a>
                </h2>
                <p>{formatLessonDescription(lesson)}</p>
                <p>
                  {t('lessons.order')}: {lesson.order}
                </p>
                <p>
                  {t('lessons.status')}: <StatusBadge>{lesson.status}</StatusBadge>
                </p>
              </article>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
