import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getCourse } from '../shared/api/courses.js';
import { listAssignments } from '../shared/api/assignments.js';
import { listLessons } from '../shared/api/lessons.js';
import { listProgress } from '../shared/api/progress.js';
import { ApiClientError, getCurrentUser } from '../shared/apiClient.js';
import type { LessonSummary } from '../shared/api/types.js';
import { formatNullableDate } from '../shared/formatDate.js';
import { getCourseHref, getLessonHref } from '../shared/learnerRoutes.js';

function getLessonMaterialsHref(lessonId: string) {
  return `/learn/lessons/${encodeURIComponent(lessonId)}/materials`;
}
import { EmptyState, PageState } from '../shared/ui.js';

type LessonsLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'loaded';
      lessons: LessonSummary[];
      completedIds: Set<string>;
      courseTitle?: string;
      deadline?: string | null;
    }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

const COLORS = {
  surface: '#ffffff',
  soft: '#f8fafc',
  text: '#172033',
  muted: '#6b7280',
  border: '#e3e8ef',
  primary: '#4f46e5',
  primarySoft: '#eef2ff',
};

export function LearnerLessonsPage({ courseId }: { courseId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LessonsLoadState>({ status: 'idle' });

  const loadLessonsWithProgress = useCallback(async () => {
    setLoadState({ status: 'loading' });

    try {
      const [lessons, { items: progressList }, currentUser, course, { items: assignments }] = await Promise.all([
        listLessons(courseId),
        listProgress({ pageSize: 200 }),
        getCurrentUser(),
        getCourse(courseId),
        listAssignments({ pageSize: 100 }),
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

      const courseAssignment = assignments.find((a) => a.courseId === courseId && a.dueAt);

      setLoadState({
        status: 'loaded',
        lessons,
        completedIds,
        courseTitle: course.title,
        deadline: courseAssignment?.dueAt ?? null,
      });
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
  const courseAction = <a href={getCourseHref(courseId)}>{t('courseDetail.title')}</a>;

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <>
        <PageState message={t('lessons.loading')} variant="loading" />
      </>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <>
        <PageState title={t('lessons.title')} message={loadState.message} variant="error" action={loginAction} />
      </>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <>
        <PageState title={t('lessons.title')} message={loadState.message} variant="error" action={courseAction} />
      </>
    );
  }

  const { lessons, completedIds } = loadState;
  const publishedLessons = [...lessons.filter((l) => l.status === 'published')].sort((a, b) => a.order - b.order);
  const completedCount = publishedLessons.filter((l) => completedIds.has(l.id)).length;
  const currentLesson = publishedLessons.find((l) => !completedIds.has(l.id));
  const overallPercent =
    publishedLessons.length > 0 ? Math.round((completedCount / publishedLessons.length) * 100) : 0;

  return (
    <div className="learner-lessons">
      <nav className="learner-breadcrumb">
        <a href={getCourseHref(courseId)}>{t('courseDetail.title')}</a>
      </nav>

      <section
        style={{
          background: 'linear-gradient(135deg,#4338ca,#6d5dfc)',
          color: '#fff',
          borderRadius: '22px',
          padding: '30px',
          marginBottom: '22px',
          boxShadow: '0 18px 45px rgba(67,56,202,.22)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr', gap: '24px', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: '0 0 12px', fontSize: '28px' }}>{loadState.courseTitle ?? t('lessons.title')}</h2>
            <p style={{ margin: 0, color: '#e0e7ff', lineHeight: 1.65 }}>
              {currentLesson
                ? t('lessons.heroText', { completed: completedCount, total: publishedLessons.length, next: currentLesson.title })
                : t('lessons.heroTextDone', { total: publishedLessons.length })}
            </p>
          </div>
          <div style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.18)', borderRadius: '18px', padding: '20px' }}>
            <span style={{ display: 'block', color: '#dbeafe', fontSize: '13px', marginBottom: '5px' }}>{t('lessons.heroProgress')}</span>
            <strong style={{ fontSize: '42px' }}>{overallPercent}%</strong>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(280px,.75fr)', gap: '22px', alignItems: 'start' }}>
        <div className="ds-card" style={{ padding: '24px' }}>
          <h3 style={{ margin: '0 0 18px', fontSize: '18px', color: '#172033' }}>{t('lessons.listTitle')}</h3>
          {publishedLessons.length === 0 ? (
            <EmptyState message={t('lessons.empty')} />
          ) : (
            <ol className="learner-lessons__list">
              {publishedLessons.map((lesson) => {
                const done = completedIds.has(lesson.id);
                const isCurrent = !done && lesson.id === currentLesson?.id;
                return (
                  <li key={lesson.id} className={`learner-lesson-card ${done ? 'learner-lesson-card--done' : ''}`}>
                    <div className="learner-lesson-card__info">
                      <span className="learner-lesson-card__order">{lesson.order}</span>
                      <div className="learner-lesson-card__body">
                        <h2 className="learner-lesson-card__title">
                          <a href={getLessonHref(lesson.id)}>{lesson.title}</a>
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
                    ) : isCurrent ? (
                      <span
                        style={{ display: 'inline-flex', padding: '7px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 800, background: COLORS.primarySoft, color: COLORS.primary }}
                      >
                        {t('lessons.statusCurrent')}
                      </span>
                    ) : (
                      <span
                        style={{ display: 'inline-flex', padding: '7px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 800, background: COLORS.soft, color: COLORS.muted }}
                      >
                        {t('lessons.statusAvailable')}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <aside style={{ display: 'grid', gap: '18px', position: 'sticky', top: '98px' }}>
          <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '18px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '18px', color: COLORS.text }}>{t('lessons.progressTitle')}</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '10px', fontSize: '14px' }}>
              <span style={{ color: COLORS.muted }}>{t('lessons.heroProgress')}</span>
              <strong style={{ color: COLORS.text }}>{completedCount} / {publishedLessons.length}</strong>
            </div>
            <div style={{ height: '10px', background: '#edf0f5', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '999px', width: `${overallPercent}%`, background: `linear-gradient(90deg,${COLORS.primary},#7c3aed)`, transition: 'width .3s ease' }} />
            </div>
          </section>

          <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '18px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px' }}>
            <h3 style={{ margin: '0 0 18px', fontSize: '18px', color: COLORS.text }}>{t('lessons.detailsTitle')}</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              {currentLesson ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
                  <span style={{ color: COLORS.muted }}>{t('lessons.currentLessonLabel')}</span>
                  <strong>{currentLesson.title}</strong>
                </div>
              ) : null}
              {loadState.deadline ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px' }}>
                  <span style={{ color: COLORS.muted }}>{t('lessons.deadlineLabel')}</span>
                  <strong>{formatNullableDate(loadState.deadline, '')}</strong>
                </div>
              ) : null}
            </div>
          </section>

          <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '18px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px', display: 'grid', gap: '10px' }}>
            {currentLesson ? (
              <a
                href={getLessonHref(currentLesson.id)}
                style={{ display: 'block', textAlign: 'center', border: `1px solid ${COLORS.primary}`, background: COLORS.primary, color: '#fff', borderRadius: '12px', padding: '13px 18px', fontWeight: 800, textDecoration: 'none' }}
              >
                {t('lessons.actionContinue')}
              </a>
            ) : null}
            <a
              href={getCourseHref(courseId)}
              style={{ display: 'block', textAlign: 'center', border: `1px solid ${COLORS.border}`, background: COLORS.surface, color: COLORS.text, borderRadius: '12px', padding: '13px 18px', fontWeight: 800, textDecoration: 'none' }}
            >
              {t('lessons.actionCourse')}
            </a>
            {currentLesson ? (
              <a
                href={getLessonMaterialsHref(currentLesson.id)}
                style={{ display: 'block', textAlign: 'center', border: `1px solid ${COLORS.border}`, background: COLORS.surface, color: COLORS.text, borderRadius: '12px', padding: '13px 18px', fontWeight: 800, textDecoration: 'none' }}
              >
                {t('lessons.actionMaterials')}
              </a>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
