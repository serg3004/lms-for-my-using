import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ApiClientError,
  AssessmentAttemptResult,
  AssessmentSummary,
  createAssessmentAttempt,
  getAssessment,
  getAttemptResult,
  issueCertificate,
} from '../shared/apiClient.js';
import { apiRequest } from '../shared/apiClient.js';
import { PageState } from '../shared/ui.js';

type Question = {
  id: string;
  type: 'single_choice' | 'multiple_choice' | 'true_false';
  title: string;
  text: string | null;
  points: number;
  order: number;
};

type Option = {
  id: string;
  text: string | null;
  imageUrl: string | null;
};

type QuestionWithOptions = Question & { options: Option[] };
type SelectedAnswers = Record<string, string | string[]>;

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; assessment: AssessmentSummary; questions: QuestionWithOptions[] }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'done'; result: AssessmentAttemptResult; certificateId: string | null }
  | { status: 'error'; message: string };

function selectedIds(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

function buildAnswers(questions: QuestionWithOptions[], selected: SelectedAnswers) {
  return questions.map((q) => {
    const value = selected[q.id];
    if (q.type === 'multiple_choice') {
      return { questionId: q.id, selectedOptionIds: selectedIds(value) };
    }
    return { questionId: q.id, selectedOptionId: typeof value === 'string' ? value : undefined };
  });
}

function countAnswered(questions: QuestionWithOptions[], selected: SelectedAnswers): number {
  return questions.filter((q) => {
    const value = selected[q.id];
    return q.type === 'multiple_choice' ? selectedIds(value).length > 0 : typeof value === 'string';
  }).length;
}

function getSubmitErrorKey(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return 'assessments.sessionExpired';
    if (error.status === 400) {
      const msg = error.message.toLowerCase();
      if (msg.includes('attempts limit')) return 'assessments.errorAttemptsLimit';
      if (msg.includes('course must be completed')) return 'assessments.errorCourseNotComplete';
      if (msg.includes('must be published')) return 'assessments.errorNotPublished';
    }
  }
  return 'assessments.errorSubmit';
}

function getOptionLabel(option: Option): string {
  return option.text ?? option.imageUrl ?? option.id;
}

export function LearnerAssessmentTakingPage({ assessmentId }: { assessmentId: string }) {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [selected, setSelected] = useState<SelectedAnswers>({});
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });

  const loadAssessment = useCallback(async () => {
    setLoadState({ status: 'loading' });
    try {
      const assessment = await getAssessment(assessmentId);
      const questions = await apiRequest<Question[]>(`/assessments/${encodeURIComponent(assessmentId)}/questions`);
      const questionsWithOptions = await Promise.all(
        questions
          .slice()
          .sort((a, b) => a.order - b.order)
          .map(async (q) => ({
            ...q,
            options: await apiRequest<Option[]>(`/questions/${encodeURIComponent(q.id)}/options`),
          })),
      );
      setLoadState({ status: 'loaded', assessment, questions: questionsWithOptions });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setLoadState({ status: 'unauthenticated', message: t('assessments.sessionExpired') });
        return;
      }
      setLoadState({ status: 'error', message: t('assessments.loadError') });
    }
  }, [assessmentId, t]);

  useEffect(() => {
    void loadAssessment();
  }, [loadAssessment]);

  function selectSingle(questionId: string, optionId: string) {
    setSelected((prev) => ({ ...prev, [questionId]: optionId }));
  }

  function selectMultiple(questionId: string, optionId: string, checked: boolean) {
    setSelected((prev) => {
      const current = selectedIds(prev[questionId]);
      const next = checked ? [...current, optionId] : current.filter((id) => id !== optionId);
      return { ...prev, [questionId]: next };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadState.status !== 'loaded') return;

    const answeredCount = countAnswered(loadState.questions, selected);
    if (answeredCount < loadState.questions.length) {
      setSubmitState({ status: 'error', message: t('assessments.errorAnswerAll') });
      return;
    }

    setSubmitState({ status: 'submitting' });

    try {
      const attempt = await createAssessmentAttempt(assessmentId, buildAnswers(loadState.questions, selected));
      const result = await getAttemptResult(attempt.id);

      let certificateId: string | null = null;
      if (result.passed) {
        try {
          const cert = await issueCertificate({
            organizationId: result.organizationId,
            courseId: loadState.assessment.courseId,
            userId: result.userId,
            assessmentAttemptId: result.id,
          });
          certificateId = cert.id;
        } catch {
          // Certificate issuance failed — don't block result display
        }
      }

      setSubmitState({ status: 'done', result, certificateId });
    } catch (error) {
      setSubmitState({ status: 'error', message: t(getSubmitErrorKey(error)) });
    }
  }

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const backLink = `/learn/assessments/${encodeURIComponent(assessmentId)}`;

  if (loadState.status === 'loading') {
    return (
      <main>
        <PageState message={t('assessments.takeLoading')} variant="loading" />
      </main>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <main>
        <PageState title={t('assessments.takeTitle')} message={loadState.message} variant="error" action={loginAction} />
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main>
        <PageState title={t('assessments.takeTitle')} message={loadState.message} variant="error" action={<a href="/learn/assessments">{t('assessments.navLink')}</a>} />
      </main>
    );
  }

  const { assessment, questions } = loadState;
  const answeredCount = countAnswered(questions, selected);

  if (submitState.status === 'done') {
    const { result, certificateId } = submitState;
    return (
      <main className="learner-quiz">
        <nav className="learner-breadcrumb">
          <a href="/learn/assessments">{t('assessments.navLink')}</a>
          <span>›</span>
          <a href={backLink}>{assessment.title}</a>
        </nav>

        <div className={`learner-quiz__result-banner ${result.passed ? 'learner-quiz__result-banner--passed' : 'learner-quiz__result-banner--failed'}`}>
          <span className="learner-quiz__result-label">
            {result.passed ? t('assessments.resultPassed') : t('assessments.resultFailed')}
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
                        {answer.selectedOption ? getOptionLabel(answer.selectedOption) : '—'}
                      </p>
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
          {certificateId ? (
            <a className="learner-btn learner-btn--primary" href={`/learn/certificates/${encodeURIComponent(certificateId)}`}>
              {t('assessments.viewCertificate')}
            </a>
          ) : (
            <a className="learner-btn learner-btn--primary" href={backLink}>{t('assessments.backToAssessment')}</a>
          )}
          {!result.passed ? (
            <button
              className="learner-btn learner-btn--secondary"
              type="button"
              onClick={() => { setSelected({}); setSubmitState({ status: 'idle' }); }}
            >
              {t('assessments.retryBtn')}
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="learner-quiz">
      <nav className="learner-breadcrumb">
        <a href="/learn/assessments">{t('assessments.navLink')}</a>
        <span>›</span>
        <a href={backLink}>{assessment.title}</a>
      </nav>

      <header className="learner-quiz__header">
        <h1>{assessment.title}</h1>
        {assessment.description ? <p className="learner-quiz__description">{assessment.description}</p> : null}
        <div className="learner-quiz__meta">
          <span>{t('assessments.resultPassingScore', { score: assessment.passingScore })}</span>
          {assessment.maxAttempts ? <span>{t('assessments.maxAttempts')}: {assessment.maxAttempts}</span> : null}
        </div>
      </header>

      {questions.length === 0 ? (
        <p className="learner-quiz__empty">{t('assessments.noQuestions')}</p>
      ) : (
        <form className="learner-quiz__form" onSubmit={handleSubmit}>
          <div className="learner-quiz__progress">
            {t('assessments.answered', { answered: answeredCount, total: questions.length })}
          </div>

          <ol className="learner-quiz__questions">
            {questions.map((question, index) => {
              const isAnswered = question.type === 'multiple_choice'
                ? selectedIds(selected[question.id]).length > 0
                : typeof selected[question.id] === 'string';

              return (
                <li key={question.id} className={`learner-quiz__question ${isAnswered ? 'learner-quiz__question--answered' : ''}`}>
                  <div className="learner-quiz__question-header">
                    <span className="learner-quiz__question-num">{index + 1}</span>
                    <h3 className="learner-quiz__question-title">{question.title}</h3>
                    <span className="learner-quiz__question-points">{question.points} pt</span>
                  </div>
                  {question.text ? <p className="learner-quiz__question-text">{question.text}</p> : null}

                  <ul className="learner-quiz__options">
                    {question.options.map((option) => {
                      const label = getOptionLabel(option);
                      if (question.type === 'multiple_choice') {
                        const checked = selectedIds(selected[question.id]).includes(option.id);
                        return (
                          <li key={option.id} className={`learner-quiz__option ${checked ? 'learner-quiz__option--selected' : ''}`}>
                            <label className="learner-quiz__option-label">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => selectMultiple(question.id, option.id, e.target.checked)}
                              />
                              <span>{label}</span>
                            </label>
                          </li>
                        );
                      }
                      const checked = selected[question.id] === option.id;
                      return (
                        <li key={option.id} className={`learner-quiz__option ${checked ? 'learner-quiz__option--selected' : ''}`}>
                          <label className="learner-quiz__option-label">
                            <input
                              type="radio"
                              name={question.id}
                              checked={checked}
                              onChange={() => selectSingle(question.id, option.id)}
                            />
                            <span>{label}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ol>

          {submitState.status === 'error' ? (
            <p className="learner-quiz__submit-error" role="alert">{submitState.message}</p>
          ) : null}

          <div className="learner-quiz__submit-row">
            <button
              className="learner-btn learner-btn--primary"
              disabled={submitState.status === 'submitting'}
              type="submit"
            >
              {submitState.status === 'submitting' ? t('assessments.submitting') : t('assessments.submitBtn')}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
