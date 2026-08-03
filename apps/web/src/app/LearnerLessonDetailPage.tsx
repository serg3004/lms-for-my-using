import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ApiClientError,
  type CourseMaterialSummary,
  type LessonSummary,
  getCurrentUser,
  listCourseMaterials,
  markLessonCompleted,
} from '../shared/apiClient.js';
import { getCourse } from '../shared/api/courses.js';
import { listLessons, getLesson } from '../shared/api/lessons.js';
import { listProgress } from '../shared/api/progress.js';
import type { CourseSummary } from '../shared/api/types.js';
import { getLessonHref, getCourseHref } from '../shared/learnerRoutes.js';
import { ProgressBar, PageState } from '../shared/ui.js';

type LessonDetailLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'loaded';
      lesson: LessonSummary;
      course: CourseSummary;
      allLessons: LessonSummary[];
      materials: CourseMaterialSummary[];
      completedIds: Set<string>;
    }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

type CompletionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'completed' }
  | { status: 'error'; message: string };

export function LearnerLessonDetailPage({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LessonDetailLoadState>({ status: 'idle' });
  const [completionState, setCompletionState] = useState<CompletionState>({ status: 'idle' });

  const load = useCallback(async () => {
    setLoadState({ status: 'loading' });
    try {
      const lesson = await getLesson(lessonId);
      const [course, allLessons, allMaterials, { items: progressRecords }] = await Promise.all([
        getCourse(lesson.courseId) as Promise<CourseSummary>,
        listLessons(lesson.courseId),
        listCourseMaterials(lesson.courseId),
        listProgress({ pageSize: 200 }),
      ]);
      const materials = allMaterials.filter((m) => m.lessonId === lesson.id && m.status === 'active');
      const completedIds = new Set(
        progressRecords
          .filter((p) => p.courseId === lesson.courseId && p.lessonId && p.status === 'completed')
          .map((p) => p.lessonId as string),
      );
      setLoadState({ status: 'loaded', lesson, course, allLessons, materials, completedIds });
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

  useEffect(() => { void load(); }, [load]);

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
      setCompletionState({ status: 'completed' });
      void load();
    } catch (error) {
      setCompletionState({
        status: 'error',
        message: error instanceof ApiClientError && error.status === 401
          ? t('lessonDetail.sessionExpired')
          : t('lessonDetail.completionError'),
      });
    }
  }

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return <PageState message={t('lessonDetail.loading')} variant="loading" />;
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <PageState
        title={t('lessonDetail.title')}
        message={loadState.message}
        variant="error"
        action={<a href="/login">{t('login.navLink')}</a>}
      />
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <PageState
        title={t('lessonDetail.title')}
        message={loadState.message}
        variant="error"
        action={<a href="/learn/courses">{t('courses.navLink')}</a>}
      />
    );
  }

  const { lesson, course, allLessons, completedIds } = loadState;
  const sortedLessons = [...allLessons].sort((a, b) => a.order - b.order);
  const currentIndex = sortedLessons.findIndex((l) => l.id === lesson.id);
  const lessonNumber = currentIndex + 1;
  const totalLessons = sortedLessons.length;
  const completedCount = sortedLessons.filter((l) => completedIds.has(l.id)).length;
  const progressPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const isDone = completionState.status === 'completed' || completedIds.has(lesson.id);
  const previousLesson = currentIndex > 0 ? sortedLessons[currentIndex - 1] : null;

  const C = {
    text: '#172033',
    muted: '#6b7280',
    border: '#e3e8ef',
    surface: '#fff',
    primary: '#4f46e5',
    primarySoft: '#eef2ff',
    success: '#0f9f6e',
    successSoft: '#e9f8f2',
    soft: '#f8fafc',
  };

  const cardStyle = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: '20px', boxShadow: '0 8px 24px rgba(23,32,51,.05)' };

  return (
    <>
      <nav className="learner-breadcrumb">
        <a href="/learn/courses">{t('courses.title')}</a>
        <span aria-hidden="true"> / </span>
        <a href={getCourseHref(course.id)}>{course.title}</a>
        <span aria-hidden="true"> / </span>
        <span>{lesson.title}</span>
      </nav>

      {/* Page head */}
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '22px' }}>
        <div>
          <div style={{ color: C.primary, fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>
            {t('lessonDetail.title')} {lessonNumber} / {totalLessons}
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 'clamp(24px,3vw,34px)', fontWeight: 800, color: C.text }}>
            {lesson.title}
          </h1>
          {lesson.description ? (
            <p style={{ margin: 0, color: C.muted, lineHeight: 1.6, maxWidth: '640px', fontSize: '15px' }}>
              {lesson.description}
            </p>
          ) : null}
        </div>
        <span style={{
          display: 'inline-flex', padding: '9px 14px', borderRadius: '999px', whiteSpace: 'nowrap',
          flexShrink: 0,
          background: isDone ? C.successSoft : C.primarySoft,
          color: isDone ? C.success : C.primary,
          fontWeight: 800, fontSize: '13px',
        }}>
          {isDone ? t('lessonDetail.donePill') : t('lessonDetail.inProgress')}
        </span>
      </section>

      {/* 2-col layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(280px,.65fr)', gap: '22px', alignItems: 'start' }}>
        {/* Left: main card */}
        <article style={{ ...cardStyle, padding: '24px' }}>
          {/* Video placeholder */}
          <div style={{
            minHeight: '280px', borderRadius: '18px', marginBottom: '24px',
            background: 'radial-gradient(circle at top right,rgba(255,255,255,.18),transparent 35%),linear-gradient(135deg,#1e1b4b,#4338ca)',
            display: 'grid', placeItems: 'center', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%',
              border: '1px solid rgba(255,255,255,.35)',
              background: 'rgba(255,255,255,.14)',
              display: 'grid', placeItems: 'center',
              fontSize: '28px', color: '#fff',
            }}>
              ▶
            </div>
            <div style={{ position: 'absolute', left: '20px', right: '20px', bottom: '16px', display: 'flex', justifyContent: 'space-between', color: '#e0e7ff', fontSize: '13px' }}>
              <span>{t('lessonDetail.videoLabel')}</span>
              <span>{t('lessonDetail.videoSubtitles')}</span>
            </div>
          </div>

          {/* Lesson description as body */}
          {lesson.description ? (
            <p style={{ color: C.muted, lineHeight: 1.75, margin: '0 0 24px', fontSize: '15px' }}>
              {lesson.description}
            </p>
          ) : null}

          {/* Error */}
          {completionState.status === 'error' ? (
            <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#dc2626' }} role="alert">
              {completionState.message}
            </p>
          ) : null}

          {/* Action row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
            {previousLesson ? (
              <a
                href={getLessonHref(previousLesson.id)}
                style={{ border: `1px solid ${C.border}`, background: C.surface, borderRadius: '12px', padding: '12px 16px', fontWeight: 800, textDecoration: 'none', color: C.text }}
              >
                {t('lessonDetail.previousLesson')}
              </a>
            ) : <span />}
            <button
              type="button"
              disabled={completionState.status === 'submitting' || isDone}
              onClick={() => void handleCompleteLesson(lesson)}
              style={{
                border: '1px solid', borderRadius: '12px', padding: '12px 20px', fontWeight: 800,
                cursor: completionState.status === 'submitting' || isDone ? 'default' : 'pointer',
                background: isDone ? C.successSoft : C.primary,
                borderColor: isDone ? C.success : C.primary,
                color: isDone ? C.success : '#fff',
                opacity: completionState.status === 'submitting' ? 0.6 : 1,
                transition: 'opacity .15s',
              }}
            >
              {isDone
                ? t('lessonDetail.alreadyCompleted')
                : completionState.status === 'submitting'
                  ? t('lessonDetail.completing')
                  : t('lessonDetail.completeAction')}
            </button>
          </div>
        </article>

        {/* Right sidebar */}
        <aside style={{ display: 'grid', gap: '16px', position: 'sticky', top: '98px' }}>
          {/* Progress card */}
          <section style={{ ...cardStyle, padding: '22px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '16px', fontWeight: 700, color: C.text }}>
              {t('lessonDetail.progressTitle')}
            </h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: C.muted }}>
              <span>{t('lessons.heroProgress')}</span>
              <strong style={{ color: C.text }}>{completedCount} / {totalLessons}</strong>
            </div>
            <ProgressBar value={progressPct} size="sm" />
          </section>

          {/* Contents card */}
          <section style={{ ...cardStyle, padding: '22px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 700, color: C.text }}>
              {t('lessonDetail.contentsTitle')}
            </h3>
            <div style={{ display: 'grid', gap: '8px' }}>
              {sortedLessons.map((l, idx) => {
                const isActive = l.id === lesson.id;
                const isLessonDone = completedIds.has(l.id) || (isActive && isDone);
                return (
                  <div
                    key={l.id}
                    style={{
                      display: 'grid', gridTemplateColumns: '36px minmax(0,1fr)', gap: '10px', alignItems: 'start',
                      padding: '10px', border: '1px solid', borderRadius: '12px',
                      borderColor: isActive ? '#c7d2fe' : C.border,
                      background: isActive ? C.primarySoft : 'transparent',
                    }}
                  >
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', display: 'grid', placeItems: 'center', background: isLessonDone ? C.successSoft : C.soft, color: isLessonDone ? C.success : C.muted, fontWeight: 800, fontSize: '13px' }}>
                      {isLessonDone ? '✓' : idx + 1}
                    </div>
                    <div>
                      {isActive ? (
                        <strong style={{ display: 'block', fontSize: '13px', color: C.text, marginBottom: '2px' }}>{l.title}</strong>
                      ) : (
                        <a href={getLessonHref(l.id)} style={{ display: 'block', fontSize: '13px', color: C.muted, textDecoration: 'none', marginBottom: '2px' }}>{l.title}</a>
                      )}
                      <span style={{ fontSize: '11px', color: isActive ? C.primary : C.muted }}>
                        {isLessonDone ? t('lessonDetail.alreadyCompleted') : isActive ? t('lessonDetail.inProgress') : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Materials button */}
          <section style={{ ...cardStyle, padding: '16px' }}>
            <a
              href={`/learn/lessons/${encodeURIComponent(lessonId)}/materials`}
              style={{ display: 'block', textAlign: 'center', border: `1px solid ${C.border}`, background: C.surface, borderRadius: '12px', padding: '12px 16px', fontWeight: 800, textDecoration: 'none', color: C.text }}
            >
              {t('lessonDetail.materialsTitle')}
            </a>
          </section>
        </aside>
      </div>
    </>
  );
}
