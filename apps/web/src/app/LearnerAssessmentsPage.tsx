import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError, AssessmentSummary, listAssessments } from '../shared/apiClient.js';
import { getReadableTitle } from '../shared/displayLabels.js';
import { EmptyState, PageState, StatusBadge } from '../shared/ui.js';

type ReadableAssessmentSummary = AssessmentSummary & {
  courseTitle?: string | null;
  course?: { title?: string | null } | null;
};

type AssessmentsLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; assessments: ReadableAssessmentSummary[] }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

function getAssessmentHref(assessmentId: string) {
  return `/learn/assessments/${encodeURIComponent(assessmentId)}`;
}

function getCourseTitle(assessment: ReadableAssessmentSummary, fallback: string) {
  return getReadableTitle(assessment.courseTitle ?? assessment.course?.title, fallback);
}

export function LearnerAssessmentsPage() {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<AssessmentsLoadState>({ status: 'idle' });

  useEffect(() => {
    let isMounted = true;

    async function loadAssessments() {
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
        <PageState message={t('assessments.loading')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <PageState
          title={t('assessments.title')}
          message={loadState.message}
          variant="error"
          action={<a href="/login">{t('login.navLink')}</a>}
        />
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main>
        <PageState
          title={t('assessments.title')}
          message={loadState.message}
          variant="error
          action={<a href="/learn">{t('learner.navLink')}</a>}
        />
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
        <EmptyState message={t('assessments.empty')} />
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
                  <dt>{t('assessments.course', 'Course')}</dt>
                  <dd>{getCourseTitle(assessment, 'Course')}</dd>
                  <dt>{t('assessments.status')}</dt>
                  <dd>
                    <StatusBadge>{assessment.status}</StatusBadge>
                  </dd>
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
