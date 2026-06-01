import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, ProgressSummary, listProgress } from '../shared/apiClient.js';
import { getListItemLabel, getReadableTitle } from '../shared/displayLabels.js';

type ReadableProgressSummary = ProgressSummary & {
  courseTitle?: string | null;
  lessonTitle?: string | null;
  course?: { title?: string | null } | null;
  lesson?: { title?: string | null } | null;
};

type ProgressLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; progress: ReadableProgressSummary[] }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

function getCourseHref(courseId: string) {
  return `/learn/courses/${encodeURIComponent(courseId)}`;
}

function getLessonHref(lessonId: string) {
  return `/learn/lessons/${encodeURIComponent(lessonId)}`;
}

function getCourseTitle(item: ReadableProgressSummary, fallback: string) {
  return getReadableTitle(item.courseTitle ?? item.course?.title, fallback);
}

function getLessonTitle(item: ReadableProgressSummary, fallback: string) {
  return getReadableTitle(item.lessonTitle ?? item.lesson?.title, fallback);
}

function formatProgressDate(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }

  return new Date(value).toLocaleString();
}

export function LearnerProgressPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<ProgressLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadProgress() {
      setLoadState({ status: 'loading' });

      try {
        const progress = await listProgress();

        if (isMounted) {
          setLoadState({ status: 'loaded', progress });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 401) {
          setLoadState({
            status: 'unauthenticated',
            message: t('progress.sessionExpired'),
          });
          return;
        }

        if (error instanceof ApiClientError && error.status === 404) {
          setLoadState({
            status: 'notFound',
            message: t('progress.notFound'),
          });
          return;
        }

        setLoadState({
          status: 'error',
          message: t('progress.loadError'),
        });
      }
    }

    void loadProgress();

    return () => {
      isMounted = false;
    };
  }, [t]);

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <p>{t('progress.loading')}</p>
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <h1>{t('progress.title')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/login">{t('login.navLink')}</a>
      </main>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <main>
        <h1>{t('progress.title')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/learn">{t('learner.navLink')}</a>
      </main>
    );
  }

  return (
    <main>
      <nav>
        <a href="/learn">{t('learner.navLink')}</a>
        <a href="/learn/courses">{t('courses.navLink')}</a>
      </nav>

      <h1>{t('progress.title')}</h1>

      {loadState.progress.length === 0 ? (
        <p>{t('progress.empty')}</p>
      ) : (
        <ul>
          {loadState.progress.map((item, index) => {
            const courseTitle = getCourseTitle(item, 'Course');

            return (
              <li key={item.id}>
                <article>
                  <h2>{getListItemLabel('Progress record', index)}</h2>
                  <dl>
                    <dt>Course</dt>
                    <dd>
                      <a href={getCourseHref(item.courseId)}>{courseTitle}</a>
                    </dd>
                    <dt>Lesson</dt>
                    <dd>
                      {item.lessonId ? (
                        <a href={getLessonHref(item.lessonId)}>{getLessonTitle(item, 'Lesson')}</a>
                      ) : (
                        t('progress.notAvailable')
                      )}
                    </dd>
                    <dt>{t('progress.score')}</dt>
                    <dd>{item.score ?? t('progress.notAvailable')}</dd>
                    <dt>{t('progress.completedAt')}</dt>
                    <dd>{formatProgressDate(item.completedAt, t('progress.notAvailable'))}</dd>
                  </dl>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
