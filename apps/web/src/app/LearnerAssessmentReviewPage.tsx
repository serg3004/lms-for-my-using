import { useTranslation } from 'react-i18next';

import { AssessmentAttemptResult, getAttemptResult } from '../shared/apiClient.js';
import { PageState } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { getAssessmentOptionLabel } from './assessment-taking/model.js';

type AssessmentReviewData = { result: AssessmentAttemptResult };

export function LearnerAssessmentReviewPage({ attemptId }: { attemptId: string }) {
  const { t } = useTranslation();

  const { state: loadState } = useAsyncData<AssessmentReviewData>(
    async () => {
      const result = await getAttemptResult(attemptId);
      return { result };
    },
    [attemptId, t],
    {
      unauthenticated: t('assessments.sessionExpired'),
      notFound: t('assessments.reviewNotFound'),
      error: t('assessments.loadError'),
    },
  );

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const assessmentsAction = <a href="/learn/assessments">{t('assessments.navLink')}</a>;

  if (loadState.status === 'loading') {
    return <PageState message={t('assessments.reviewLoading')} variant="loading" />;
  }

  if (loadState.status === 'unauthenticated') {
    return <PageState title={t('assessments.reviewTitle')} message={loadState.message} variant="error" action={loginAction} />;
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return <PageState title={t('assessments.reviewTitle')} message={loadState.message} variant="error" action={assessmentsAction} />;
  }

  const { result } = loadState.data;
  const assessmentHref = `/learn/assessments/${encodeURIComponent(result.assessmentId)}`;

  return (
    <div className="learner-quiz">
      <nav className="learner-breadcrumb">
        <a href="/learn/assessments">{t('assessments.navLink')}</a>
        <span>›</span>
        <a href={assessmentHref}>{result.assessment.title}</a>
      </nav>

      <div className={`learner-quiz__result-banner ${result.passed ? 'learner-quiz__result-banner--passed' : 'learner-quiz__result-banner--failed'}`}>
        <span className="learner-quiz__result-label">
          {result.passed
            ? result.assessment.passMessage || t('assessments.resultPassed')
            : result.assessment.failMessage || t('assessments.resultFailed')}
        </span>
        <span className="learner-quiz__result-score">
          {t('assessments.resultScore', { score: result.score, maxScore: result.maxScore, percentage: result.percentage })}
        </span>
        <span className="learner-quiz__result-passing">
          {t('assessments.resultPassingScore', { score: result.assessment.passingScore })}
        </span>
      </div>

      {result.answers.length > 0 ? (
        <section className="learner-quiz__breakdown">
          <h2>{t('assessments.resultBreakdown')}</h2>
          <ol className="learner-quiz__breakdown-list">
            {result.answers
              .slice()
              .sort((a, b) => a.question.order - b.question.order)
              .map((answer) => (
                <li key={answer.id} className={`learner-quiz__breakdown-item ${answer.isCorrect ? 'learner-quiz__breakdown-item--correct' : 'learner-quiz__breakdown-item--wrong'}`}>
                  <div className="learner-quiz__breakdown-icon">{answer.isCorrect ? '✓' : '✗'}</div>
                  <div className="learner-quiz__breakdown-body">
                    <p className="learner-quiz__breakdown-question">{answer.question.title}</p>
                    <p className="learner-quiz__breakdown-answer">
                      <span className="learner-quiz__breakdown-answer-label">{t('assessments.resultYourAnswer')}:</span>{' '}
                      {answer.selectedOption ? getAssessmentOptionLabel(answer.selectedOption) : '—'}
                    </p>
                    {!answer.isCorrect && answer.correctOptions && answer.correctOptions.length > 0 ? (
                      <p className="learner-quiz__breakdown-answer learner-quiz__breakdown-answer--correct">
                        <span className="learner-quiz__breakdown-answer-label">{t('assessments.resultCorrectAnswer')}:</span>{' '}
                        {answer.correctOptions.map((option) => getAssessmentOptionLabel(option)).join(', ')}
                      </p>
                    ) : null}
                    <p className="learner-quiz__breakdown-points">
                      {answer.score} / {answer.question.points} {answer.isCorrect ? t('assessments.resultCorrect') : t('assessments.resultIncorrect')}
                    </p>
                  </div>
                </li>
              ))}
          </ol>
        </section>
      ) : null}

      <div className="learner-quiz__result-actions">
        <a className="learner-btn learner-btn--primary" href={assessmentHref}>{t('assessments.backToAssessment')}</a>
      </div>
    </div>
  );
}
