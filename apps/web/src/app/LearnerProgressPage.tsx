import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listProgress } from '../shared/api/progress.js';
import { ApiClientError } from '../shared/apiClient.js';
import type { ProgressSummary } from '../shared/api/types.js';
import { getListItemLabel, getReadableTitle } from '../shared/displayLabels.js';
import { formatNullableDate } from '../shared/formatDate.js';
import { getCourseHref, getLessonHref } from '../shared/learnerRoutes.js';
import { EmptyState, PageState } from '../shared/ui.js';

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

function getCourseTitle(item: ReadableProgressSummary, fallback: string) {
  return getReadableTitle(item.courseTitle ?? item.course?.title, fallback);
}

function getLessonTitle(item: ReadableProgressSummary, fallback: string) {
  return getReadableTitle(item.lessonTitle ?? item.lesson?.title, fallback);
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

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const learnerAction = <a href="/learn">{t('learner.navLink')}</a>;

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <PageState message={t('progress.loading')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <PageState
          title={t('progress.title')}
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
          title={t('progress.title')}
          message={loadState.message}
          variant="error"
          action={learnerAction}
        />
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
        <EmptyState message={t('progress.empty')} />
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
                    <dd>{formatNullableDate(item.completedAt, t('progress.notAvailable'))}</dd>
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
