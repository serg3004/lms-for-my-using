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
import { listLessons } from '../shared/api/lessons.js';
import { listProgress } from '../shared/api/progress.js';
import type { CourseSummary, ProgressSummary } from '../shared/api/types.js';
import { getLesson } from '../shared/api/lessons.js';
import { getLessonHref, getCourseHref } from '../shared/learnerRoutes.js';
import { Badge, Button, ProgressBar, PageState } from '../shared/ui.js';
import '../styles/ui.css';

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

function materialIcon(kind: string): string {
  if (kind === 'pdf' || kind === 'document') return '📄';
  if (kind === 'video') return '🎬';
  if (kind === 'link' || kind === 'url') return '🔗';
  return '📎';
}

function materialMeta(material: CourseMaterialSummary): string {
  if (material.fileUrl && material.mimeType) {
    const parts: string[] = [];
    const ext = material.mimeType.split('/')[1]?.toUpperCase() ?? material.kind.toUpperCase();
    parts.push(ext);
    if (material.sizeBytes) {
      const kb = Math.round(material.sizeBytes / 1024);
      parts.push(kb < 1024 ? `${kb} КБ` : `${(kb / 1024).toFixed(1)} МБ`);
    }
    return parts.join(' · ');
  }
  if (material.fileUrl) return 'Внешняя ссылка';
  return material.kind;
}

export function LearnerLessonDetailPage({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LessonDetailLoadState>({ status: 'idle' });
  const [completionState, setCompletionState] = useState<CompletionState>({ status: 'idle' });

  const load = useCallback(async () => {
    setLoadState({ status: 'loading' });
    try {
      const lesson = await getLesson(lessonId);
      const [course, allLessons, allMaterials, progressRecords] = await Promise.all([
        getCourse(lesson.courseId) as Promise<CourseSummary>,
        listLessons(lesson.courseId),
        listCourseMaterials(lesson.courseId),
        listProgress() as Promise<ProgressSummary[]>,
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

  const { lesson, course, allLessons, materials, completedIds } = loadState;
  const sortedLessons = allLessons.slice().sort((a, b) => a.order - b.order);
  const currentIndex = sortedLessons.findIndex((l) => l.id === lesson.id);
  const lessonNumber = currentIndex + 1;
  const totalLessons = sortedLessons.length;
  const completedCount = sortedLessons.filter((l) => completedIds.has(l.id)).length;
  const progressPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const isDone = completionState.status === 'completed' || completedIds.has(lesson.id);

  return (
    <>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', fontSize: '13px', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
        <a href="/learn/courses" style={{ color: 'var(--color-text-muted)' }}>{t('courses.title', 'Мои курсы')}</a>
        <span>/</span>
        <a href={getCourseHref(course.id)} style={{ color: 'var(--color-primary)' }}>{course.title}</a>
        <span>/</span>
        <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>Урок {lessonNumber}</span>
      </div>

      {/* 2-col layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '32px', alignItems: 'start' }}>
        {/* Left: article */}
        <article>
          <header style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Badge variant="new">Урок {lessonNumber} из {totalLessons}</Badge>
            </div>
            <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--fw-bold)', marginBottom: '8px', color: 'var(--color-text)' }}>
              {lesson.title}
            </h1>
            {lesson.description ? (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
                {lesson.description}
              </p>
            ) : null}
          </header>

          {/* Materials card */}
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '24px', background: 'var(--color-surface)', boxShadow: 'var(--shadow-card)', marginBottom: '20px' }}>
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--fw-bold)', marginBottom: '12px', color: 'var(--color-text)' }}>
              {t('lessonDetail.materialsTitle', 'Материалы урока')}
            </h2>
            {materials.length === 0 ? (
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                {t('lessonDetail.noMaterials', 'Нет прикреплённых материалов.')}
              </p>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {materials.map((material) => (
                  <div
                    key={material.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                        {materialIcon(material.kind)} {material.title}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        {materialMeta(material)}
                      </div>
                    </div>
                    {material.fileUrl ? (
                      <a
                        href={material.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ds-button ds-button--secondary ds-button--sm"
                      >
                        {material.kind === 'link' || material.kind === 'url' ? 'Открыть →' : 'Скачать'}
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Complete lesson card */}
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '24px', background: 'var(--color-surface)', boxShadow: 'var(--shadow-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--fw-bold)', margin: 0, color: 'var(--color-text)' }}>
                {t('lessonDetail.completeTitle', 'Отметить урок')}
              </h2>
            </div>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: '16px', color: 'var(--color-text-muted)' }}>
              {t('lessonDetail.completeHint', 'После изучения материала нажмите кнопку, чтобы отметить урок как пройденный.')}
            </p>
            {completionState.status === 'error' ? (
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--color-danger)' }} role="alert">
                {completionState.message}
              </p>
            ) : null}
            <Button
              variant={isDone ? 'secondary' : 'primary'}
              type="button"
              disabled={completionState.status === 'submitting' || isDone}
              onClick={() => void handleCompleteLesson(lesson)}
            >
              {isDone
                ? t('lessonDetail.alreadyCompleted', '✓ Урок пройден')
                : completionState.status === 'submitting'
                  ? t('lessonDetail.completing', 'Сохранение...')
                  : t('lessonDetail.completeAction', '✓ Урок пройден')}
            </Button>
          </div>
        </article>

        {/* Right: sidebar */}
        <aside style={{ position: 'sticky', top: '105px' }}>
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--color-surface)', boxShadow: 'var(--shadow-card)' }}>
            {/* Course header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--fw-bold)', color: 'var(--color-text)' }}>
                {course.title}
              </div>
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  <span>Прогресс</span>
                  <span>{completedCount} / {totalLessons}</span>
                </div>
                <ProgressBar value={progressPct} size="sm" />
              </div>
            </div>
            {/* Lesson list */}
            <div>
              {sortedLessons.map((l, idx) => {
                const isActive = l.id === lesson.id;
                const isLessonDone = completedIds.has(l.id) || (isActive && isDone);
                const isLast = idx === sortedLessons.length - 1;
                return (
                  <div
                    key={l.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '11px 14px',
                      borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
                      background: isLessonDone
                        ? 'var(--color-success-bg)'
                        : isActive
                          ? 'rgb(37 99 235 / 5%)'
                          : 'transparent',
                    }}
                  >
                    <span
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: isLessonDone
                          ? 'var(--color-success)'
                          : isActive
                            ? 'var(--color-primary)'
                            : 'var(--color-surface-muted)',
                        color: isLessonDone || isActive ? '#fff' : 'var(--color-text-muted)',
                        fontSize: '11px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isLessonDone ? '✓' : idx + 1}
                    </span>
                    {isActive ? (
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: isActive ? 600 : 400,
                          color: isLessonDone ? 'var(--color-success)' : isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                        }}
                      >
                        {idx + 1}. {l.title}
                      </span>
                    ) : (
                      <a
                        href={getLessonHref(l.id)}
                        style={{
                          fontSize: '13px',
                          color: isLessonDone ? 'var(--color-success)' : 'var(--color-text-muted)',
                          textDecoration: 'none',
                        }}
                      >
                        {idx + 1}. {l.title}
                      </a>
                    )}
                  </div>
                );
              })}
              {sortedLessons.length === 0 ? (
                <div style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                  Нет уроков
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
