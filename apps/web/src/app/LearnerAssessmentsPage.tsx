import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, AssessmentSummary, listAssessments } from '../shared/apiClient.js';
import { getAuthToken } from '../shared/authToken.js';

type AssessmentsLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; assessments: AssessmentSummary[] }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

function getAssessmentHref(assessmentId: string) {
  return `/learn/assessments/${encodeURIComponent(assessmentId)}`;
}

export function LearnerAssessmentsPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<AssessmentsLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadAssessments() {
      if (!getAuthToken()) {
        setLoadState({
          status: 'unauthenticated',
          message: t('assessments.authRequired'),
        });
        return;
      }

      setLoadState({ status: 'loading' });

      try {
        const assessments = await listAssessments();

        if (isMounted) {
          setLoadState({ status: 'loaded', assessments });
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

        setLoadState({
          status: 'error',
          message: t('assessments.loadError'),
        });
      }
    }

    void loadAssessments();

    return () => {
      isMounted = false;
    };
  }, [t]);

  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return (
      <main>
        <p>{t('assessments.loading')}</p>
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <h1>{t('assessments.title')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/login">{t('login.navLink')}</a>
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main>
        <h1>{t('assessments.title')}</h1>
        <p role="alert">{loadState.message}</p>
        <a href="/learn">{t('learner.navLink')}</a>
      </main>
    );
  }

  return (
    <main>
      <nav>
        <a href="/learn">{t('learner.navLink')}</a>
      </nav>

      <h1>{t('assessments.title')}</h1>

      {loadState.assessments.length === 0 ? (
        <p>{t('assessments.empty')}</p>
      ) : (
        <ul>
          {loadState.assessments.map((assessment) => (
            <li key={assessment.id}>
              <article>
                <h2>
                  <a href={getAssessmentHref(assessment.id)}>{assessment.title}</a>
                </h2>
                <p>{assessment.description?.trim() || assessment.slug}</p>
                <dl>
                  <dt>{t('assessments.courseId')}</dt>
                  <dd>{assessment.courseId}</dd>
                  <dt>{t('assessments.status')}</dt>
                  <dd>{assessment.status}</dd>
                  <dt>{t('assessments.passingScore')}</dt>
                  <dd>{assessment.passingScore}</dd>
                  <dt>{t('assessments.maxAttempts')}</dt>
                  <dd>{assessment.maxAttempts}</dd>
                </dl>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
