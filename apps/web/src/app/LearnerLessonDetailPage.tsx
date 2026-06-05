import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ApiClientError,
  CourseMaterialSummary,
  LessonSummary,
  getCurrentUser,
  getLesson,
  listCourseMaterials,
  markLessonCompleted,
} from '../shared/apiClient.js';
import { getCourseLessonsHref } from '../shared/learnerRoutes.js';
import { PageState } from '../shared/ui.js';

type LessonDetailLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; lesson: LessonSummary; materials: CourseMaterialSummary[] }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

type CompletionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'completed'; message: string }
  | { status: 'error'; message: string };


function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LearnerLessonDetailPage({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LessonDetailLoadState>({ status: 'idle' });
  const [completionState, setCompletionState] = useState<CompletionState>({ status: 'idle' });

  const loadLessonWithMaterials = useCallback(async () => {
    setLoadState({ status: 'loading' });

    try {
      const lesson = await getLesson(lessonId);
      const allMaterials = await listCourseMaterials(lesson.courseId);
      const materials = allMaterials.filter((m) => m.lessonId === lesson.id && m.status === 'active');

      setLoadState({ status: 'loaded', lesson, materials });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setLoadState({ status: 'unauthenticated', message: t('lessonDetail.sessionExpired') });
        return;
      }
      if (error instanceof ApiClientError && error.status === 404) {
        setLoadState({ status: 'notFound', message: t('lessonDetail.notFound') });
        return;
      }
      setLoadState({ status: 'error', message: t('lessonDetail.loadError') });
    }
  }, [lessonId, t]);

  useEffect(() => {
    void loadLessonWithMaterials();
  }, [loadLessonWithMaterials]);

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

      setCompletionState({ status: 'completed', message: t('lessonDetail.completionSuccess') });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setCompletionState({ status: 'error', message: t('lessonDetail.sessionExpired') });
        return;
      }
      setCompletionState({ status: 'error', message: t('lessonDetail.completionError') });
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

  const { lesson, materials } = loadState;
  const isCompleted = completionState.status === 'completed';

  return (
    <main className="learner-lesson">
      <nav className="learner-breadcrumb">
        <a href={getCourseLessonsHref(lesson.courseId)}>{t('lessons.navLink')}</a>
      </nav>

      <article className="learner-lesson__article">
        <header className="learner-lesson__header">
          <h1>{lesson.title}</h1>
          {lesson.description ? <p className="learner-lesson__description">{lesson.description}</p> : null}
        </header>

        <section className="learner-lesson__materials">
          <h2>{t('lessonDetail.materialsTitle')}</h2>
          {materials.length === 0 ? (
            <p className="learner-lesson__no-materials">{t('lessonDetail.noMaterials')}</p>
          ) : (
            <ul className="learner-materials-list">
              {materials.map((material) => (
                <li key={material.id} className="learner-material-item">
                  <div className="learner-material-item__info">
                    <span className="learner-material-item__title">
                      {material.fileUrl ? (
                        <a href={material.fileUrl} target="_blank" rel="noopener noreferrer">
                          {material.title}
                        </a>
                      ) : (
                        material.title
                      )}
                    </span>
                    {material.description ? (
                      <span className="learner-material-item__desc">{material.description}</span>
                    ) : null}
                  </div>
                  <div className="learner-material-item__meta">
                    <span className="learner-material-item__kind">{material.kind}</span>
                    {material.sizeBytes ? (
                      <span className="learner-material-item__size">{formatFileSize(material.sizeBytes)}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="learner-lesson__footer">
          <button
            className={`learner-btn ${isCompleted ? 'learner-btn--completed' : 'learner-btn--primary'}`}
            disabled={completionState.status === 'submitting' || isCompleted}
            type="button"
            onClick={() => void handleCompleteLesson(lesson)}
          >
            {isCompleted
              ? t('lessonDetail.alreadyCompleted')
              : completionState.status === 'submitting'
                ? t('lessonDetail.completing')
                : t('lessonDetail.completeAction')}
          </button>
          {completionState.status === 'completed' ? (
            <p className="learner-lesson__success">{completionState.message}</p>
          ) : null}
          {completionState.status === 'error' ? (
            <p className="learner-lesson__error" role="alert">
              {completionState.message}
            </p>
          ) : null}
        </footer>
      </article>
    </main>
  );
}
