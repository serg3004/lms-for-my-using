import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, AssessmentSummary, getAssessment } from '../shared/apiClient.js';
import { getReadableTitle } from '../shared/displayLabels.js';
import { PageState, StatusBadge } from '../shared/ui.js';

type ReadableAssessmentSummary = AssessmentSummary & {
  courseTitle?: string | null;
  lessonTitle?: string | null;
  course?: { title?: string | null } | null;
  lesson?: { title?: string | null } | null;
};

type AssessmentDetailLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; assessment: ReadableAssessmentSummary }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

function getCourseHref(courseId: string) {
  return `/learn/courses/${encodeURIComponent(courseId)}`;
}

function getLessonHref(lessonId: string) {
  return `/learn/lessons/${encodeURIComponent(lessonId)}`;
}

function getCourseTitle(assessment: ReadableAssessmentSummary, fallback: string) {
  return getReadableTitle(assessment.courseTitle ?? assessment.course?.title, fallback);
}

function getLessonTitle(assessment: ReadableAssessmentSummary, fallback: string) {
  return getReadableTitle(assessment.lessonTitle ?? assessment.lesson?.title, fallback);
}

function formatBoolean(value: boolean, trueLabel: string, falseLabel: string) {
  return value ? trueLabel : falseLabel;
}

export function LearnerAssessmentDetailPage({ assessmentId }: { assessmentId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<AssessmentDetailLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadAssessment() {
      setLoadState({ status: 'loading' });

      try {
        const assessment = await getAssessment(assessmentId);

        if (isMounted) {
          setLoadState({ status: 'loaded', assessment });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiClientError && error.status === 401) {
          setLoadState({
            status: 'unauthenticated',
            message: t('assessments.sessionExpired'),
          });
          return;
        }

        if (error instanceof ApiClientError && error.status === 404) {
          setLoadState({
            status: 'notFound',
            message: t('assessments.notFound'),
          });
          return;
        }

        setLoadState({
          status: 'error',
          message: t('assessments.loadError'),
        });
      }
    }

    void loadAssessment();

    return () => {
      isMounted = false;
    };
  }, [assessmentId, t]);

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const assessmentsAction = <a href="/learn/assessments">{t('assessments.navLink')}</a>;

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <PageState message={t('assessments.loadingDetail')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <PageState title={t('assessments.detailTitle')} message={loadState.message} variant="error" action={loginAction} />
      </main>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <main>
        <PageState
          title={t('assessments.detailTitle')}
          message={loadState.message}
          variant="error"
          action={assessmentsAction}
        />
      </main>
    );
  }

  const courseTitle = getCourseTitle(loadState.assessment, 'Course');

  const takeHref = `/learn/assessments/${encodeURIComponent(loadState.assessment.id)}/take`;

  return (
    <main>
      <nav>
        <a href="/learn/assessments">{t('assessments.navLink')}</a>
        <a href={getCourseHref(loadState.assessment.courseId)}>{courseTitle}</a>
      </nav>

      <article>
        <h1>{loadState.assessment.title}</h1>
        <p>{loadState.assessment.description?.trim() || loadState.assessment.slug}</p>
        <dl>
          <dt>{t('assessments.course', 'Course')}</dt>
          <dd>{courseTitle}</dd>
          <dt>{t('assessments.lesson', 'Lesson')}</dt>
          <dd>
            {loadState.assessment.lessonId ? (
              <a href={getLessonHref(loadState.assessment.lessonId)}>
                {getLessonTitle(loadState.assessment, 'Lesson')}
              </a>
            ) : (
              t('assessments.notAvailable')
            )}
          </dd>
          <dt>{t('assessments.status')}</dt>
          <dd>
            <StatusBadge>{loadState.assessment.status}</StatusBadge>
          </dd>
          <dt>{t('assessments.passingScore')}</dt>
          <dd>{loadState.assessment.passingScore}</dd>
          <dt>{t('assessments.maxAttempts')}</dt>
          <dd>{loadState.assessment.maxAttempts}</dd>
          <dt>{t('assessments.availableAfterCourseCompletion')}</dt>
          <dd>
            {formatBoolean(
              loadState.assessment.availableAfterCourseCompletion,
              t('assessments.yes'),
              t('assessments.no'),
            )}
          </dd>
        </dl>

        {loadState.assessment.status === 'published' ? (
          <a className="learner-btn learner-btn--primary" href={takeHref}>
            {t('assessments.startBtn')}
          </a>
        ) : null}
      </article>
    </main>
  );
}
