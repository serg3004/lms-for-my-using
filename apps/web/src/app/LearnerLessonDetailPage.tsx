import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, LessonSummary, getLesson } from '../shared/apiClient.js';
import { getAuthToken } from '../shared/authToken.js';

type LessonDetailLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; lesson: LessonSummary }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

function formatLessonDescription(lesson: LessonSummary) {
  return lesson.description?.trim() || lesson.slug;
}

function getCourseLessonsHref(courseId: string) {
  return `/learn/courses/${encodeURIComponent(courseId)}/lessons`;
}

export function LearnerLessonDetailPage({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LessonDetailLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadLesson() {
      if (!getAuthToken()) {
        setLoadState({
          status: 'unauthenticated',
          message: t('lessonDetail.authRequired'),
        });
        return;
      }

      setLoadState({ status: 'loading' });

      try {
        const lesson = await getLesson(lessonId);

        if (isMounted) {
          setLoadState({ status: 'loaded', lesson });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 401) {
          setLoadState({
            status: 'unauthenticated',
            message: t('lessonDetail.sessionExpired'),
          });
          return;
        }

        if (error instanceof ApiClientError && error.status === 404) {
          setLoadState({
            status: 'notFound',
            message: t('lessonDetail.notFound'),
          });
          return;
        }

        setLoadState({
          status: 'error',
          message: t('lessonDetail.loadError'),
        });
      }
    }

    void loadLesson();

    return () => {
      isMounted = false;
    };
  }, [lessonId, t]);

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <p>{t('lessonDetail.loading')}</p>
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <h1>{t('lessonDetail.title')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/login">{t('login.navLink')}</a>
      </main>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <main>
        <h1>{t('lessonDetail.title')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/learn/courses">{t('courses.navLink')}</a>
      </main>
    );
  }

  return (
    <main>
      <nav>
        <a href={getCourseLessonsHref(loadState.lesson.courseId)}>{t('lessons.navLink')}</a>
      </nav>

      <article>
        <h1>{loadState.lesson.title}</h1>
        <p>{formatLessonDescription(loadState.lesson)}</p>
        <dl>
          <dt>{t('lessonDetail.order')}</dt>
          <dd>{loadState.lesson.order}</dd>
          <dt>{t('lessonDetail.status')}</dt>
          <dd>{loadState.lesson.status}</dd>
          <dt>{t('lessonDetail.slug')}</dt>
          <dd>{loadState.lesson.slug}</dd>
        </dl>
      </article>
    </main>
  );
}
