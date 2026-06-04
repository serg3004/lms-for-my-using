import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listLessons } from '../shared/api/lessons.js';
import { listProgress } from '../shared/api/progress.js';
import { ApiClientError, getCurrentUser } from '../shared/apiClient.js';
import type { LessonSummary } from '../shared/api/types.js';
import { EmptyState, PageState } from '../shared/ui.js';

type LessonsLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; lessons: LessonSummary[]; completedIds: Set<string> }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

function getLessonDetailHref(lesson: LessonSummary) {
  return `/learn/lessons/${encodeURIComponent(lesson.id)}`;
}

function getCourseDetailHref(courseId: string) {
  return `/learn/courses/${encodeURIComponent(courseId)}`;
}

export function LearnerLessonsPage({ courseId }: { courseId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LessonsLoadState>({ status: 'idle' });

  const loadLessonsWithProgress = useCallback(async () => {
    setLoadState({ status: 'loading' });

    try {
      const [lessons, progressList, currentUser] = await Promise.all([
        listLessons(courseId),
        listProgress(),
        getCurrentUser(),
      ]);

      const completedIds = new Set(
        progressList
          .filter(
            (p) =>
              p.courseId === courseId &&
              p.userId === currentUser.id &&
              p.status === 'completed' &&
              p.lessonId !== null,
          )
          .map((p) => p.lessonId as string),
      );

      setLoadState({ status: 'loaded', lessons, completedIds });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setLoadState({ status: 'unauthenticated', message: t('lessons.sessionExpired') });
        return;
      }
      if (error instanceof ApiClientError && error.status === 404) {
        setLoadState({ status: 'notFound', message: t('lessons.notFound') });
        return;
      }
      setLoadState({ status: 'error', message: t('lessons.loadError') });
    }
  }, [courseId, t]);

  useEffect(() => {
    void loadLessonsWithProgress();
  }, [loadLessonsWithProgress]);

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

  const { lessons, completedIds } = loadState;
  const completedCount = lessons.filter((l) => completedIds.has(l.id)).length;
  const publishedLessons = lessons.filter((l) => l.status === 'published');

  return (
    <main className="learner-lessons">
      <nav className="learner-breadcrumb">
        <a href={getCourseDetailHref(courseId)}>{t('courseDetail.title')}</a>
      </nav>

      <div className="learner-lessons__header">
        <h1>{t('lessons.title')}</h1>
        {publishedLessons.length > 0 ? (
          <div className="learner-progress-summary">
            <span className="learner-progress-summary__text">
              {t('lessons.progressSummary', { completed: completedCount, total: publishedLessons.length })}
            </span>
            <div className="learner-progress-bar">
              <div
                className="learner-progress-bar__fill"
                style={{ width: `${publishedLessons.length > 0 ? (completedCount / publishedLessons.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {publishedLessons.length === 0 ? (
        <EmptyState message={t('lessons.empty')} />
      ) : (
        <ol className="learner-lessons__list">
          {publishedLessons.map((lesson) => {
            const done = completedIds.has(lesson.id);
            return (
              <li key={lesson.id} className={`learner-lesson-card ${done ? 'learner-lesson-card--done' : ''}`}>
                <div className="learner-lesson-card__info">
                  <span className="learner-lesson-card__order">{lesson.order}</span>
                  <div className="learner-lesson-card__body">
                    <h2 className="learner-lesson-card__title">
                      <a href={getLessonDetailHref(lesson)}>{lesson.title}</a>
                    </h2>
                    {lesson.description ? (
                      <p className="learner-lesson-card__desc">{lesson.description}</p>
                    ) : null}
                  </div>
                </div>
                {done ? (
                  <span className="learner-lesson-card__badge" aria-label={t('lessonDetail.alreadyCompleted')}>
                    ✓
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
