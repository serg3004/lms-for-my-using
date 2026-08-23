import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ApiClientError,
  AssessmentAttemptResult,
  AssessmentSummary,
  createAssessmentAttempt,
  getAssessment,
  getAttemptResult,
  issueCertificate,
  startAssessmentAttempt,
} from '../shared/apiClient.js';
import { apiRequest } from '../shared/apiClient.js';
import { PageState } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import {
  buildAssessmentAnswers,
  computeSecondsLeft,
  countAnsweredQuestions,
  getAnswerOutcome,
  getAssessmentOptionLabel,
  getAssessmentSubmitErrorKey,
  selectedIds,
  type QuestionWithOptions,
  type SelectedAnswers,
} from './assessment-taking/model.js';

type LearnerAssessmentTakingData = { assessment: AssessmentSummary; questions: QuestionWithOptions[] };

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'done'; result: AssessmentAttemptResult; certificateId: string | null }
  | { status: 'error'; message: string };

export function LearnerAssessmentTakingPage({ assessmentId }: { assessmentId: string }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<SelectedAnswers>({});
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timerError, setTimerError] = useState<string | null>(null);

  const { state: loadState } = useAsyncData<LearnerAssessmentTakingData>(
    async () => {
      const assessment = await getAssessment(assessmentId);
      const questionsWithOptions = await apiRequest<QuestionWithOptions[]>(
        `/assessments/${encodeURIComponent(assessmentId)}/quiz`,
      );
      return { assessment, questions: questionsWithOptions };
    },
    [assessmentId, t],
    { unauthenticated: t('assessments.sessionExpired'), error: t('assessments.loadError') },
  );

  /**
   * Untimed assessments (timeLimitMinutes null, the default): no timer shown at all. Timed ones:
   * calling the start endpoint (idempotent — resumes an existing in_progress attempt rather than
   * restarting the clock) gets the server-trusted startedAt, so the countdown can't be reset by
   * refreshing the page or be fooled by the browser's clock.
   *
   * Deliberately keeps a local timerError instead of writing into loadState: this effect runs
   * outside the normal load cycle (it doesn't (re)fetch the assessment), so it isn't a case
   * useAsyncData's reload()/mutate() cover — it's a side channel that needs its own state.
   */
  useEffect(() => {
    if (loadState.status !== 'loaded' || !loadState.data.assessment.timeLimitMinutes) {
      setSecondsLeft(null);
      return;
    }

    const timeLimitMinutes = loadState.data.assessment.timeLimitMinutes;
    let cancelled = false;
    setTimerError(null);

    void (async () => {
      try {
        const attempt = await startAssessmentAttempt(assessmentId);
        if (cancelled) return;
        setSecondsLeft(computeSecondsLeft(attempt.startedAt, timeLimitMinutes));
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiClientError) {
          setTimerError(error.message);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [loadState, assessmentId]);

  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => (s !== null && s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

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

    const answeredCount = countAnsweredQuestions(loadState.data.questions, selected);
    if (answeredCount < loadState.data.questions.length) {
      setSubmitState({ status: 'error', message: t('assessments.errorAnswerAll') });
      return;
    }

    setSubmitState({ status: 'submitting' });

    try {
      const attempt = await createAssessmentAttempt(assessmentId, buildAssessmentAnswers(loadState.data.questions, selected));
      const result = await getAttemptResult(attempt.id);

      let certificateId: string | null = null;
      if (result.passed) {
        try {
          const cert = await issueCertificate({
            organizationId: result.organizationId,
            courseId: loadState.data.assessment.courseId,
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
      setSubmitState({ status: 'error', message: t(getAssessmentSubmitErrorKey(error)) });
    }
  }

  const loginAction = <a href="/login">{t('login.navLink')}</a>;
  const backLink = `/learn/assessments/${encodeURIComponent(assessmentId)}`;

  if (loadState.status === 'loading') {
    return (
      <>
        <PageState message={t('assessments.takeLoading')} variant="loading" />
      </>
    );
  }

  if (loadState.status === 'unauthenticated') {
    return (
      <>
        <PageState title={t('assessments.takeTitle')} message={loadState.message} variant="error" action={loginAction} />
      </>
    );
  }

  if (loadState.status === 'notFound' || loadState.status === 'error') {
    return (
      <>
        <PageState title={t('assessments.takeTitle')} message={loadState.message} variant="error" action={<a href="/learn/assessments">{t('assessments.navLink')}</a>} />
      </>
    );
  }

  if (timerError) {
    return (
      <>
        <PageState title={t('assessments.takeTitle')} message={timerError} variant="error" action={<a href="/learn/assessments">{t('assessments.navLink')}</a>} />
      </>
    );
  }

  const { assessment, questions } = loadState.data;

  if (submitState.status === 'done') {
    const { result, certificateId } = submitState;
    return (
      <div className="learner-quiz">
        <nav className="learner-breadcrumb">
          <a href="/learn/assessments">{t('assessments.navLink')}</a>
          <span>›</span>
          <a href={backLink}>{assessment.title}</a>
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
                .map((answer) => {
                  const outcome = getAnswerOutcome(answer);
                  const outcomeIcon = { correct: '✓', partial: '½', incorrect: '✗' }[outcome];
                  const outcomeLabel = { correct: t('assessments.resultCorrect'), partial: t('assessments.resultPartial'), incorrect: t('assessments.resultIncorrect') }[outcome];
                  return (
                    <li key={answer.id} className={`learner-quiz__breakdown-item learner-quiz__breakdown-item--${outcome}`}>
                      <div className="learner-quiz__breakdown-icon">{outcomeIcon}</div>
                      <div className="learner-quiz__breakdown-body">
                        <p className="learner-quiz__breakdown-question">{answer.question.title}</p>
                        <p className="learner-quiz__breakdown-answer">
                          <span className="learner-quiz__breakdown-answer-label">{t('assessments.resultYourAnswer')}:</span>{' '}
                          {answer.selectedOption ? getAssessmentOptionLabel(answer.selectedOption) : '—'}
                        </p>
                        {outcome !== 'correct' && answer.correctOptions && answer.correctOptions.length > 0 ? (
                          <p className="learner-quiz__breakdown-answer learner-quiz__breakdown-answer--correct">
                            <span className="learner-quiz__breakdown-answer-label">{t('assessments.resultCorrectAnswer')}:</span>{' '}
                            {answer.correctOptions.map((option) => getAssessmentOptionLabel(option)).join(', ')}
                          </p>
                        ) : null}
                        <p className="learner-quiz__breakdown-points">
                          {answer.score} / {answer.question.points} {outcomeLabel}
                        </p>
                      </div>
                    </li>
                  );
                })}
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
      </div>
    );
  }

  const timerWarning = secondsLeft !== null && secondsLeft < 120;

  return (
    <div className="learner-quiz">
      <nav className="learner-breadcrumb">
        <a href="/learn/assessments">{t('assessments.navLink')}</a>
        <span>›</span>
        <a href={backLink}>{assessment.title}</a>
      </nav>

      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#4f46e5', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
            {t('assessments.eyebrow')}
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(24px,3vw,32px)', fontWeight: 800, color: '#172033', lineHeight: 1.2 }}>
            {assessment.title}
          </h1>
          <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: '14px' }}>
            {t('assessments.subtitleTaking', { current: currentIndex + 1, total: questions.length, score: assessment.passingScore })}
          </p>
        </div>
        {secondsLeft !== null && (
          <div
            aria-live="polite"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 20px', background: timerWarning ? '#fef2f2' : '#f8fafc', border: `1px solid ${timerWarning ? '#fca5a5' : '#e3e8ef'}`, borderRadius: '16px', minWidth: '120px' }}
          >
            <span style={{ color: timerWarning ? '#dc2626' : '#6b7280', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {t('assessments.timerLabel')}
            </span>
            <strong style={{ color: timerWarning ? '#dc2626' : '#172033', fontSize: '26px', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, marginTop: '4px' }}>
              {secondsLeft > 0 ? formatTime(secondsLeft) : t('assessments.timerExpired')}
            </strong>
          </div>
        )}
      </section>

      <section style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', fontSize: '13px', marginBottom: '8px' }}>
          <span>{t('assessments.progressLabel')}</span>
          <strong>{Math.round(((currentIndex + 1) / questions.length) * 100)}%</strong>
        </div>
        <div style={{ height: '8px', background: '#edf0f5', borderRadius: '999px', overflow: 'hidden' }}>
          <div style={{ width: `${((currentIndex + 1) / questions.length) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#4f46e5,#7c3aed)', borderRadius: '999px' }} />
        </div>
      </section>

      {questions.length === 0 ? (
        <p className="learner-quiz__empty">{t('assessments.noQuestions')}</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(220px,.65fr)', gap: '22px', alignItems: 'start' }}>
          <form className="learner-quiz__form" onSubmit={handleSubmit}>
            {(() => {
              const question = questions[currentIndex];
              const isAnswered =
                question.type === 'multiple_choice'
                  ? selectedIds(selected[question.id]).length > 0
                  : typeof selected[question.id] === 'string';
              const isLastQuestion = currentIndex === questions.length - 1;

              return (
                <ol className="learner-quiz__questions">
                  <li className={`learner-quiz__question ${isAnswered ? 'learner-quiz__question--answered' : ''}`}>
                    <div className="learner-quiz__question-header">
                      <span className="learner-quiz__question-num">{currentIndex + 1}</span>
                      <h3 className="learner-quiz__question-title">{question.title}</h3>
                      <span className="learner-quiz__question-points">{question.points} pt</span>
                    </div>
                    {question.text ? <p className="learner-quiz__question-text">{question.text}</p> : null}

                    <ul className="learner-quiz__options">
                      {question.options.map((option) => {
                        const label = getAssessmentOptionLabel(option);
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

                  <li className="learner-quiz__submit-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '20px' }}>
                    <button
                      className="learner-btn learner-btn--secondary"
                      type="button"
                      disabled={currentIndex === 0}
                      onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                    >
                      {t('assessments.previousQuestion')}
                    </button>
                    {isLastQuestion ? (
                      <button
                        className="learner-btn learner-btn--primary"
                        disabled={submitState.status === 'submitting'}
                        type="submit"
                      >
                        {submitState.status === 'submitting' ? t('assessments.submitting') : t('assessments.submitBtn')}
                      </button>
                    ) : (
                      <button
                        className="learner-btn learner-btn--primary"
                        type="button"
                        onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                      >
                        {t('assessments.nextQuestion')}
                      </button>
                    )}
                  </li>
                </ol>
              );
            })()}

            {submitState.status === 'error' ? (
              <p className="learner-quiz__submit-error" role="alert">{submitState.message}</p>
            ) : null}
          </form>

          <aside style={{ position: 'sticky', top: '98px' }}>
            <div style={{ background: '#fff', border: '1px solid #e3e8ef', borderRadius: '20px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '18px', color: '#172033' }}>{t('assessments.questionNavTitle')}</h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                {questions.map((q, i) => {
                  const isDone =
                    q.type === 'multiple_choice'
                      ? selectedIds(selected[q.id]).length > 0
                      : typeof selected[q.id] === 'string';
                  const isCurrent = i === currentIndex;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setCurrentIndex(i)}
                      style={{
                        border: `1px solid ${isCurrent ? '#4f46e5' : isDone ? '#b7ead6' : '#e3e8ef'}`,
                        background: isCurrent ? '#4f46e5' : isDone ? '#e9f8f2' : '#fff',
                        color: isCurrent ? '#fff' : isDone ? '#0f9f6e' : '#172033',
                        borderRadius: '10px',
                        height: '40px',
                        fontWeight: 700,
                        fontSize: '14px',
                        cursor: 'pointer',
                      }}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'grid', gap: '10px', marginTop: '18px', color: '#6b7280', fontSize: '13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '4px', background: '#e9f8f2', border: '1px solid #b7ead6', flexShrink: 0, display: 'inline-block' }} />
                  {t('assessments.legendAnswered')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '4px', background: '#4f46e5', border: '1px solid #4f46e5', flexShrink: 0, display: 'inline-block' }} />
                  {t('assessments.legendCurrent')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '4px', background: '#fff', border: '1px solid #e3e8ef', flexShrink: 0, display: 'inline-block' }} />
                  {t('assessments.legendNoAnswer')}
                </div>
              </div>

              <div style={{ marginTop: '16px', padding: '14px', background: '#fff7e8', color: '#8a4b05', borderRadius: '12px', fontSize: '13px', lineHeight: 1.5 }}>
                {t('assessments.autoSaveNotice')}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
