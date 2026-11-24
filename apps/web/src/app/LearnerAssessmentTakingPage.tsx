import { requiresLockedAnswers } from '@lms/shared/assessment-policy';
import { recordAssessmentAnswer } from '../shared/api/assessments.js';
import type { RecordedAssessmentAnswer } from '../shared/api/types.js';
import { correctAnswerText } from '../features/longread-exercises/answer-text.js';
import { assessmentTokenQuery } from '../shared/api/assessments.js';
import { type FormEvent, useEffect, useState } from 'react';
import { QuestionResponseFields } from '../features/longread-exercises/QuestionResponseFields.js';
import { ownAnswerText, reviewedCorrectText } from '../features/longread-exercises/answer-text.js';
import { RichText, plainText } from '../shared/RichText.js';
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
  supportsTakingQuestion,
  isQuestionAnswered,
  type QuestionWithOptions,
  type SelectedAnswers,
} from './assessment-taking/model.js';

type LearnerAssessmentTakingData = { assessment: AssessmentSummary; questions: QuestionWithOptions[]; sampledAttempt?: Awaited<ReturnType<typeof startAssessmentAttempt<QuestionWithOptions>>> };

type TakingResult = Partial<Pick<AssessmentAttemptResult, 'status' | 'id'>> & Pick<AssessmentAttemptResult, 'passed' | 'score' | 'maxScore' | 'percentage' | 'assessment' | 'answers' | 'effectiveResult'>;
type TakingPreview = LearnerAssessmentTakingData & {
  startIndex: number;
  recordAnswer: (question: QuestionWithOptions, selected: SelectedAnswers) => Promise<RecordedAssessmentAnswer>;
  submit: (questions: QuestionWithOptions[], selected: SelectedAnswers) => Promise<TakingResult>;
};

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'done'; result: TakingResult; certificateId: string | null }
  | { status: 'error'; message: string };

export function LearnerAssessmentTakingPage({ assessmentId, token, preview }: { assessmentId: string; token?: string; preview?: TakingPreview }) {
  const { t } = useTranslation();
  const [recorded, setRecorded] = useState<Record<string, RecordedAssessmentAnswer>>({});
  const [checking, setChecking] = useState(false);
  const [attemptId, setAttemptId] = useState<string>();
  const [sessionReady, setSessionReady] = useState(false);
  const [selected, setSelected] = useState<SelectedAnswers>({});
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const [currentIndex, setCurrentIndex] = useState(preview?.startIndex ?? 0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timerError, setTimerError] = useState<string | null>(null);

  const { state: loadState } = useAsyncData<LearnerAssessmentTakingData>(
    async () => {
      if (preview) return { assessment: preview.assessment, questions: preview.questions };
      const assessment = await getAssessment(assessmentId);
      if (assessment.bankSampleSize) {
        const sampledAttempt = await startAssessmentAttempt<QuestionWithOptions>(assessmentId, token);
        if (!sampledAttempt.questions) throw new Error('Missing attempt questions');
        return { assessment, questions: sampledAttempt.questions, sampledAttempt };
      }
      const questionsWithOptions = await apiRequest<QuestionWithOptions[]>(
        `/assessments/${encodeURIComponent(assessmentId)}/quiz${assessmentTokenQuery(token)}`,
      );
      return { assessment, questions: questionsWithOptions };
    },
    [assessmentId, t, token, preview],
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
    if (loadState.status !== 'loaded' || loadState.data.questions.some((question) => !supportsTakingQuestion(question))) {
      setSecondsLeft(null);
      return;
    }

    const timeLimitMinutes = loadState.data.assessment.timeLimitMinutes;
    const locked = requiresLockedAnswers(loadState.data.assessment.policy);
    if (preview || (!timeLimitMinutes && !locked && !loadState.data.sampledAttempt)) {
      setSecondsLeft(timeLimitMinutes ? timeLimitMinutes * 60 : null);
      setSessionReady(true);
      return;
    }
    let cancelled = false;
    setTimerError(null);
    setSessionReady(false);
    setAttemptId(undefined);

    void (async () => {
      try {
        const attempt = loadState.data.sampledAttempt ?? await startAssessmentAttempt(assessmentId, token);
        if (cancelled) return;
        setAttemptId(attempt.id);
        setSecondsLeft(timeLimitMinutes ? computeSecondsLeft(attempt.startedAt, timeLimitMinutes) : null);
        if (attempt.lockedAnswers?.length) {
          const answers = attempt.lockedAnswers;
          setRecorded(Object.fromEntries(answers.map((answer) => [answer.questionId, { answer }])));
          setSelected(Object.fromEntries(answers.map((answer) => [answer.questionId, answer.response ?? answer.selectedOptionIds ?? answer.selectedOptionId ?? ''])));
          setCurrentIndex(Math.min(answers.length, loadState.data.questions.length - 1));
        }
        setSessionReady(true);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiClientError) {
          setTimerError(loadState.data.assessment.policy ? t(getAssessmentSubmitErrorKey(error)) : error.message);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [loadState, assessmentId, token, preview, t]);

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

  async function checkAnswer(question: QuestionWithOptions) {
    if (checking || recorded[question.id] || !sessionReady || (!preview && !attemptId) || !isQuestionAnswered(question, selected[question.id])) return;
    setChecking(true);
    setSubmitState({ status: 'idle' });
    try {
      const result = preview
        ? await preview.recordAnswer(question, selected)
        : await recordAssessmentAnswer(assessmentId, attemptId!, buildAssessmentAnswers([question], selected)[0], token);
      setRecorded((previous) => ({ ...previous, [question.id]: result }));
      const answer = result.answer;
      setSelected((previous) => ({ ...previous, [question.id]: answer.response ?? answer.selectedOptionIds ?? answer.selectedOptionId ?? '' }));
    } catch (error) {
      setSubmitState({ status: 'error', message: t(getAssessmentSubmitErrorKey(error)) });
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadState.status !== 'loaded' || loadState.data.questions.some((question) => !supportsTakingQuestion(question))) return;

    const answeredQuestions = loadState.data.questions.slice(preview?.startIndex ?? 0);
    const answeredCount = countAnsweredQuestions(answeredQuestions, selected);
    if (!sessionReady || (requiresLockedAnswers(loadState.data.assessment.policy)
      && answeredQuestions.some((question) => !recorded[question.id])) || answeredCount < answeredQuestions.length) {
      setSubmitState({ status: 'error', message: t('assessments.errorAnswerAll') });
      return;
    }

    setSubmitState({ status: 'submitting' });

    try {
      if (preview) {
        const result = await preview.submit(answeredQuestions, selected);
        setSubmitState({ status: 'done', result, certificateId: null });
        return;
      }
      const attempt = await createAssessmentAttempt(assessmentId, buildAssessmentAnswers(loadState.data.questions, selected), token, loadState.data.assessment.policy || loadState.data.sampledAttempt ? attemptId : undefined);
      const result = await getAttemptResult(attempt.id);

      let certificateId: string | null = null;
      const courseId = result.courseId === undefined ? loadState.data.assessment.courseId : result.courseId;
      if ((result.effectiveResult?.passed ?? result.passed) && courseId) {
        try {
          const cert = await issueCertificate({
            organizationId: result.organizationId,
            courseId,
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
  const locked = requiresLockedAnswers(assessment.policy);
  const noBack = assessment.policy?.preventBacktracking;
  const allQuestions = assessment.policy?.oneQuestion === false && !locked;
  const progress = questions.length ? Math.round((allQuestions ? countAnsweredQuestions(questions, selected) : currentIndex + 1) * 100 / questions.length) : 0;
  if (questions.some((question) => !supportsTakingQuestion(question))) {
    return <PageState title={assessment.title} message={t('assessments.typedQuestionUnavailable')} variant="error" action={<a href="/learn/assessments">{t('assessments.navLink')}</a>} />;
  }

  if (submitState.status === 'done') {
    const { result, certificateId } = submitState;
    if (result.status === 'pending_review') return <div className="learner-quiz">
      <p role="status">{t('assessmentReview.pending')}</p>
      {result.id && <a href={`/learn/attempts/${result.id}`}>{t('assessments.attemptsHistoryReview')}</a>}
    </div>;
    return (
      <div className="learner-quiz">
        {!preview && <nav className="learner-breadcrumb">
          <a href="/learn/assessments">{t('assessments.navLink')}</a>
          <span>›</span>
          <a href={backLink}>{assessment.title}</a>
        </nav>}

        <div className={`learner-quiz__result-banner ${result.passed ? 'learner-quiz__result-banner--passed' : 'learner-quiz__result-banner--failed'}`}>
          <span className="learner-quiz__result-label">
            {result.passed
              ? (plainText(result.assessment.passMessage ?? '') ? <RichText value={result.assessment.passMessage ?? ''} /> : t('assessments.resultPassed'))
              : (plainText(result.assessment.failMessage ?? '') ? <RichText value={result.assessment.failMessage ?? ''} /> : t('assessments.resultFailed'))}
          </span>
          <span className="learner-quiz__result-score">
            {t('assessments.resultScore', { score: result.score, maxScore: result.maxScore, percentage: result.percentage })}
          </span>
          {result.effectiveResult && <span>
            {t('assessments.policy.effective', { policy: t(`assessments.policy.${result.effectiveResult.policy}`), percentage: result.effectiveResult.percentage })}
          </span>}
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
                          {ownAnswerText(answer, t)}
                        </p>
                        {answer.feedback && <RichText value={answer.feedback} />}
                        {outcome !== 'correct' && (answer.correctDefinition || answer.correctOptions?.length) ? (
                          <p className="learner-quiz__breakdown-answer learner-quiz__breakdown-answer--correct">
                            <span className="learner-quiz__breakdown-answer-label">{t('assessments.resultCorrectAnswer')}:</span>{' '}
                            {reviewedCorrectText(answer, t)}
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
          {!preview && (certificateId ? (
            <a className="learner-btn learner-btn--primary" href={`/learn/certificates/${encodeURIComponent(certificateId)}`}>
              {t('assessments.viewCertificate')}
            </a>
          ) : (
            <a className="learner-btn learner-btn--primary" href={backLink}>{t('assessments.backToAssessment')}</a>
          ))}
          {preview || !result.passed ? (
            <button
              className="learner-btn learner-btn--secondary"
              type="button"
              onClick={() => { if (locked && !preview) { window.location.reload(); return; }
                setSelected({}); setRecorded({}); if (preview) setCurrentIndex(preview.startIndex); setSubmitState({ status: 'idle' }); }}
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
      {!preview && <nav className="learner-breadcrumb">
        <a href="/learn/assessments">{t('assessments.navLink')}</a>
        <span>›</span>
        <a href={backLink}>{assessment.title}</a>
      </nav>}

      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: 'var(--color-primary)', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
            {t('assessments.eyebrow')}
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(24px,3vw,32px)', fontWeight: 800, color: 'var(--color-text)', lineHeight: 1.2 }}>
            {assessment.title}
          </h1>
          <p style={{ margin: '8px 0 0', color: 'var(--color-text-muted)', fontSize: '14px' }}>
            {t('assessments.subtitleTaking', { current: currentIndex + 1, total: questions.length, score: assessment.passingScore })}
          </p>
        </div>
        {secondsLeft !== null && (
          <div
            aria-live="polite"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 20px', background: timerWarning ? '#fef2f2' : 'var(--color-surface-muted)', border: `1px solid ${timerWarning ? '#fca5a5' : 'var(--color-border)'}`, borderRadius: '16px', minWidth: '120px' }}
          >
            <span style={{ color: timerWarning ? '#dc2626' : 'var(--color-text-muted)', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {t('assessments.timerLabel')}
            </span>
            <strong style={{ color: timerWarning ? '#dc2626' : 'var(--color-text)', fontSize: '26px', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, marginTop: '4px' }}>
              {secondsLeft > 0 ? formatTime(secondsLeft) : t('assessments.timerExpired')}
            </strong>
          </div>
        )}
      </section>

      <section style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)', fontSize: '13px', marginBottom: '8px' }}>
          <span>{t('assessments.progressLabel')}</span>
          <strong>{progress}%</strong>
        </div>
        <div style={{ height: '8px', background: 'var(--color-surface-muted)', borderRadius: '999px', overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg,#4f46e5,#7c3aed)', borderRadius: '999px' }} />
        </div>
      </section>

      {questions.length === 0 ? (
        <p className="learner-quiz__empty">{t('assessments.noQuestions')}</p>
      ) : (
        <div className="edit-layout">
          <form className="learner-quiz__form" onSubmit={handleSubmit}>
            <ol className="learner-quiz__questions" start={allQuestions ? 1 : currentIndex + 1}>
              {(allQuestions ? questions.map((_, index) => index) : [currentIndex]).map((index) => {
              const question = questions[index];
              const checkedAnswer = recorded[question.id];
              const value = selected[question.id];
              const isAnswered = isQuestionAnswered(question, value);
              return (
                  <li key={question.id} className={`learner-quiz__question ${isAnswered ? 'learner-quiz__question--answered' : ''}`}>
                    <div className="learner-quiz__question-header">
                      <span className="learner-quiz__question-num">{index + 1}</span>
                      <h3 className="learner-quiz__question-title">{question.title}</h3>
                      <span className="learner-quiz__question-points">{question.points} pt</span>
                    </div>
                    {question.text ? <p className="learner-quiz__question-text"><RichText value={question.text} /></p> : null}

                    {question.imageUrl && <img src={question.imageUrl} alt={question.title} style={{ maxWidth: '100%', maxHeight: 360 }} />}
                    <fieldset disabled={checking || !!checkedAnswer || (locked && !sessionReady)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                    {question.definition ? <QuestionResponseFields question={question}
                      answer={typeof value === 'object' && !Array.isArray(value) ? { questionId: question.id, response: value } : null}
                      onChange={({ response }) => { if (response) setSelected((previous) => ({ ...previous, [question.id]: response })); }} />
                    : <ul className="learner-quiz__options">
                      {question.options.map((option, index) => {
                        const label = option.imageUrl
                          ? <><img src={option.imageUrl} alt={option.text ? '' : t('longreadExercises.option', { number: index + 1 })}
                            style={{ maxWidth: '100%', maxHeight: 240 }} />{option.text}</>
                          : getAssessmentOptionLabel(option);
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
                    </ul>}
                    </fieldset>
                    {checkedAnswer?.isCorrect !== undefined && <div role="status">
                      <p>{t(checkedAnswer.isCorrect ? 'assessments.resultCorrect' : 'assessments.resultIncorrect')}</p>
                      {checkedAnswer.feedback && <RichText value={checkedAnswer.feedback} />}
                      {(checkedAnswer.correctDefinition || checkedAnswer.correctOptions?.length) && <p>
                        {t('assessments.resultCorrectAnswer')} {correctAnswerText(question, {
                          correctDefinition: checkedAnswer.correctDefinition,
                          correctOptionIds: checkedAnswer.correctOptions?.map(({ id }) => id),
                        }, t)}
                      </p>}
                    </div>}
                  </li>
              );
            })}
              <li className="learner-quiz__submit-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '20px' }}>
                    {!allQuestions && !noBack && <button
                      className="learner-btn learner-btn--secondary"
                      type="button"
                      disabled={currentIndex === 0 || checking}
                      onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                    >
                      {t('assessments.previousQuestion')}
                    </button>}
                    {locked && !recorded[questions[currentIndex].id] ? (
                      <button className="learner-btn learner-btn--primary" type="button"
                        disabled={checking || !sessionReady || !isQuestionAnswered(questions[currentIndex], selected[questions[currentIndex].id])}
                        onClick={() => void checkAnswer(questions[currentIndex])}>{t('assessments.policy.checkAnswer')}</button>
                    ) : allQuestions || currentIndex === questions.length - 1 ? (
                      <button
                        className="learner-btn learner-btn--primary"
                        disabled={submitState.status === 'submitting' || !sessionReady}
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

            {submitState.status === 'error' ? (
              <p className="learner-quiz__submit-error" role="alert">{submitState.message}</p>
            ) : null}
          </form>

          <aside style={{ position: 'sticky', top: '98px' }}>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '20px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '18px', color: 'var(--color-text)' }}>{t('assessments.questionNavTitle')}</h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                {questions.map((q, i) => {
                  const isDone = isQuestionAnswered(q, selected[q.id]);
                  const isCurrent = i === currentIndex;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      disabled={checking || allQuestions || (noBack && i !== currentIndex)
                        || (locked && i > currentIndex && (i !== currentIndex + 1 || !recorded[questions[currentIndex].id]))}
                      onClick={() => setCurrentIndex(i)}
                      style={{
                        border: `1px solid ${isCurrent ? 'var(--color-primary)' : isDone ? '#b7ead6' : 'var(--color-border)'}`,
                        background: isCurrent ? 'var(--color-primary)' : isDone ? 'var(--color-success-bg)' : 'var(--color-surface)',
                        color: isCurrent ? 'var(--color-on-primary)' : isDone ? 'var(--color-success)' : 'var(--color-text)',
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

              <div style={{ display: 'grid', gap: '10px', marginTop: '18px', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '4px', background: 'var(--color-success-bg)', border: '1px solid #b7ead6', flexShrink: 0, display: 'inline-block' }} />
                  {t('assessments.legendAnswered')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '4px', background: 'var(--color-primary)', border: '1px solid var(--color-primary)', flexShrink: 0, display: 'inline-block' }} />
                  {t('assessments.legendCurrent')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '4px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', flexShrink: 0, display: 'inline-block' }} />
                  {t('assessments.legendNoAnswer')}
                </div>
              </div>

              <div style={{ marginTop: '16px', padding: '14px', background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', borderRadius: '12px', fontSize: '13px', lineHeight: 1.5 }}>
                {t('assessments.autoSaveNotice')}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
