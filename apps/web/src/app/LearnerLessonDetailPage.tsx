import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ApiClientError,
  LessonSummary,
  getCurrentUser,
  getLesson,
  markLessonCompleted,
} from '../shared/apiClient.js';
import { PageState, StatusBadge } from '../shared/ui.js';

type LessonDetailLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; lesson: LessonSummary }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

type CompletionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'completed'; message: string }
  | { status: 'error'; message: string };

function formatLessonDescription(lesson: LessonSummary) {
  return lesson.description?.trim() || lesson.slug;
}

function getCourseLessonsHref(courseId: string) {
  return `/learn/courses/${encodeURIComponent(courseId)}/lessons`;
}

function getLessonMaterialsHref(lessonId: string) {
  return `/learn/lessons/${encodeURIComponent(lessonId)}/materials`;
}

export function LearnerLessonDetailPage({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LessonDetailLoadState>({ status: 'idle' });
  const [completionState, setCompletionState] = useState<CompletionState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadLesson() {
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

  async function handleCompleteLesson(lesson: LessonSummary) {
    setCompletionState({ status: 'submitting' });

    try {
      const currentUser = await getCurrentUser();

      await markLessonCompleted({
        organizationId: lesson.organizationId,
        courseId: lesson.courseId,
        lessonId: lesson.id,
        userId: currentUser.id,
      });

      setCompletionState({
        status: 'completed',
        message: t('lessonDetail.completionSuccess'),
      });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setCompletionState({
          status: 'error',
          message: t('lessonDetail.sessionExpired'),
        });
        return;
      }

      setCompletionState({
        status: 'error',
        message: t('lessonDetail.completionError'),
      });
    }
  }

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const coursesAction = <a href="/learn/courses">{t('courses.navLink')}</a>;

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <PageState message={t('lessonDetail.loading')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <PageState title={t('lessonDetail.title')} message={loadState.message} variant="error" action={loginAction} />
      </main>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <main>
        <PageState title={t('lessonDetail.title')} message={loadState.message} variant="error" action={coursesAction} />
      </main>
    );
  }

  return (
    <main>
      <nav>
        <a href={getCourseLessonsHref(loadState.lesson.courseId)}>{t('lessons.navLink')}</a>
        <a href={getLessonMaterialsHref(loadState.lesson.id)}>{t('materials.navLink')}</a>
      </nav>

      <article>
        <h1>{loadState.lesson.title}</h1>
        <p>{formatLessonDescription(loadState.lesson)}</p>
        <dl>
          <dt>{t('lessonDetail.order')}</dt>
          <dd>{loadState.lesson.order}</dd>
          <dt>{t('lessonDetail.status')}</dt>
          <dd>
            <StatusBadge>{loadState.lesson.status}</StatusBadge>
          </dd>
          <dt>{t('lessonDetail.slug')}</dt>
          <dd>{loadState.lesson.slug}</dd>
        </dl>
        <button
          disabled={completionState.status === 'submitting' || completionState.status === 'completed'}
          type="button"
          onClick={() => void handleCompleteLesson(loadState.lesson)}
        >
          {completionState.status === 'submitting'
            ? t('lessonDetail.completing')
            : t('lessonDetail.completeAction')}
        </button>
        {completionState.status === 'completed' ? <p>{completionState.message}</p> : null}
        {completionState.status === 'error' ? <p role="alert">{completionState.message}</p> : null}
      </article>
    </main>
  );
}
