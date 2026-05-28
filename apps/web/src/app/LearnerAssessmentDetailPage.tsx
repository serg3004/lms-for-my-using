import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, AssessmentSummary, getAssessment } from '../shared/apiClient.js';
import { getAuthToken } from '../shared/authToken.js';

type AssessmentDetailLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; assessment: AssessmentSummary }
  | { status: 'unauthenticated'; message: string }
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

function getCourseHref(courseId: string) {
  return `/learn/courses/${encodeURIComponent(courseId)}`;
}

function getLessonHref(lessonId: string) {
  return `/learn/lessons/${encodeURIComponent(lessonId)}`;
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
      if (!getAuthToken()) {
        setLoadState({
          status: 'unauthenticated',
          message: t('assessments.authRequired'),
        });
        return;
      }

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

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <p>{t('assessments.loadingDetail')}</p>
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <h1>{t('assessments.detailTitle')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/login">{t('login.navLink')}</a>
      </main>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <main>
        <h1>{t('assessments.detailTitle')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/learn/assessments">{t('assessments.navLink')}</a>
      </main>
    );
  }

  return (
    <main>
      <nav>
        <a href="/learn/assessments">{t('assessments.navLink')}</a>
        <a href={getCourseHref(loadState.assessment.courseId)}>{t('courseDetail.title')}</a>
      </nav>

      <article>
        <h1>{loadState.assessment.title}</h1>
        <p>{loadState.assessment.description?.trim() || loadState.assessment.slug}</p>
        <dl>
          <dt>{t('assessments.assessmentId')}</dt>
          <dd>{loadState.assessment.id}</dd>
          <dt>{t('assessments.courseId')}</dt>
          <dd>{loadState.assessment.courseId}</dd>
          <dt>{t('assessments.lessonId')}</dt>
          <dd>
            {loadState.assessment.lessonId ? (
              <a href={getLessonHref(loadState.assessment.lessonId)}>{loadState.assessment.lessonId}</a>
            ) : (
              t('assessments.notAvailable')
            )}
          </dd>
          <dt>{t('assessments.status')}</dt>
          <dd>{loadState.assessment.status}</dd>
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
      </article>
    </main>
  );
}
