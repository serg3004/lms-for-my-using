import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, ProgressSummary, listProgress } from '../shared/apiClient.js';
import { getAuthToken } from '../shared/authToken.js';

type ProgressLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; progress: ProgressSummary[] }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

function getCourseHref(courseId: string) {
  return `/learn/courses/${encodeURIComponent(courseId)}`;
}

function getLessonHref(lessonId: string) {
  return `/learn/lessons/${encodeURIComponent(lessonId)}`;
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
      if (!getAuthToken()) {
        setLoadState({
          status: 'unauthenticated',
          message: t('progress.authRequired'),
        });
        return;
      }

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
          {loadState.progress.map((item) => (
            <li key={item.id}>
              <article>
                <h2>{item.status}</h2>
                <dl>
                  <dt>{t('progress.courseId')}</dt>
                  <dd>
                    <a href={getCourseHref(item.courseId)}>{item.courseId}</a>
                  </dd>
                  <dt>{t('progress.lessonId')}</dt>
                  <dd>
                    {item.lessonId ? (
                      <a href={getLessonHref(item.lessonId)}>{item.lessonId}</a>
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
          ))}
        </ul>
      )}
    </main>
  );
}
