import { assessmentAccentContrast, assessmentFonts } from '@lms/shared/assessment-presentation';
import { Navigate } from 'react-router-dom';
import { AssessmentMaterial } from '../features/assessment-materials/AssessmentMaterial.js';
import { useAssessmentDraft } from './assessment-taking/draft.js';
import { requiresLockedAnswers } from '@lms/shared/assessment-policy';
import { recordAssessmentAnswer } from '../shared/api/assessments.js';
import type { RecordedAssessmentAnswer } from '../shared/api/types.js';
import { correctAnswerText } from '../features/longread-exercises/answer-text.js';
import { assessmentTokenQuery } from '../shared/api/assessments.js';
import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from 'react';
import { QuestionResponseFields } from '../features/longread-exercises/QuestionResponseFields.js';
import { ownAnswerText, reviewedCorrectText } from '../features/longread-exercises/answer-text.js';
import { RichText, plainText } from '../shared/RichText.js';
import { useTranslation } from 'react-i18next';

import {
  apiRequest,
  AssessmentAttemptResult,
  AssessmentSummary,
  createAssessmentAttempt,
  getAssessment,
  getAttemptResult,
  issueCertificate,
  startAssessmentAttempt,
} from '../shared/apiClient.js';
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

type LearnerAssessmentTakingData = { assessment: AssessmentSummary; questions: QuestionWithOptions[]; startedAttempt?: Awaited<ReturnType<typeof startAssessmentAttempt<QuestionWithOptions>>> };

const EMPTY_QUESTIONS: QuestionWithOptions[] = [];
const touchTarget = { minHeight: 44 };

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
  const [titleAccepted, setTitleAccepted] = useState(false);
  const [recorded, setRecorded] = useState<Record<string, RecordedAssessmentAnswer>>({});
  const [checking, setChecking] = useState(false);
  const [attemptId, setAttemptId] = useState<string>();
  const [sessionReady, setSessionReady] = useState(false);
  const [selected, setSelected] = useState<SelectedAnswers>({});
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const [currentIndex, setCurrentIndex] = useState(preview?.startIndex ?? 0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [marked, setMarked] = useState<string[]>([]);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const [startRetry, setStartRetry] = useState(0);
  const [expiryRetry, setExpiryRetry] = useState(0);
  const [timerError, setTimerError] = useState<string | null>(null);

  const { state: loadState } = useAsyncData<LearnerAssessmentTakingData>(
    async () => {
      if (preview) return { assessment: preview.assessment, questions: preview.questions };
      const assessment = await getAssessment(assessmentId);
      if (assessment.presentation?.titleScreen && !titleAccepted) return { assessment, questions: EMPTY_QUESTIONS };
      if (!assessment.bankSampleSize) {
        // Check compatibility before starting the timer or persisting an attempt.
        const questions = await apiRequest<QuestionWithOptions[]>(
          `/assessments/${encodeURIComponent(assessmentId)}/quiz${assessmentTokenQuery(token)}`,
        );
        if (questions.some((question) => !supportsTakingQuestion(question))) return { assessment, questions };
      }
      const startedAttempt = await startAssessmentAttempt<QuestionWithOptions>(assessmentId, token, true);
      if (!startedAttempt.questions) throw new Error('Missing attempt questions');
      return { assessment, questions: startedAttempt.questions, startedAttempt };
    },
    [assessmentId, t, token, preview, startRetry, titleAccepted],
    { unauthenticated: t('assessments.sessionExpired'), error: t('assessments.loadError') },
  );

  const draftQuestions = loadState.status === 'loaded' ? loadState.data.questions : undefined;
  const timeLimit = loadState.status === 'loaded' ? loadState.data.assessment.timeLimitMinutes : null;
  const draftLocked = loadState.status === 'loaded' && requiresLockedAnswers(loadState.data.assessment.policy);
  const draft = useAssessmentDraft(assessmentId, attemptId, token, draftQuestions ?? EMPTY_QUESTIONS, draftLocked,
    !!preview || secondsLeft === 0 || submitState.status === 'submitting' || submitState.status === 'done');
  const restoreDraft = useRef(draft.restore);
  useEffect(() => {
    if (!draftQuestions?.length || draftQuestions.some((question) => !supportsTakingQuestion(question)) || loadState.status !== 'loaded') return;
    const { assessment, startedAttempt } = loadState.data;
    const limit = assessment.timeLimitMinutes;
    if (preview) {
      if (assessment.presentation?.titleScreen && !titleAccepted && !preview.startIndex) return;
      setSecondsLeft(limit ? limit * 60 : null);
      setSessionReady(true);
      return;
    }
    let cancelled = false;
    setSessionReady(false);

    void (async () => {
      try {
        const attempt = startedAttempt;
        if (!attempt) return;
        if (cancelled) return;
        setAttemptId(attempt.id);
        const serverNow = attempt.serverNow ? Date.parse(attempt.serverNow) : Date.now();
        setDeadline(limit ? Date.now() + Date.parse(attempt.startedAt) + limit * 60_000 - serverNow : null);
        setSecondsLeft(limit ? computeSecondsLeft(attempt.startedAt, limit, serverNow) : null);
        if (attempt.status === 'completed' && limit) {
          setExpired(true);
          return;
        }
        try {
          setMarked(JSON.parse(localStorage.getItem(`assessment-marked:${attempt.id}`) ?? '[]') as string[]);
        } catch {
          setMarked([]);
        }
        const answers = attempt.lockedAnswers ?? [];
        const restored = Object.fromEntries(answers.map((answer) => [answer.questionId, answer.response ?? answer.selectedOptionIds ?? answer.selectedOptionId ?? '']));
        const local = restoreDraft.current(attempt.id);
        setSelected(draftLocked ? { ...local, ...restored } : { ...restored, ...local });
        if (draftLocked) {
          setRecorded(Object.fromEntries(answers.map((answer) => [answer.questionId, { answer }])));
          setCurrentIndex(Math.min(answers.length, draftQuestions.length - 1));
        } else {
          const first = draftQuestions.findIndex((question) => !isQuestionAnswered(question, (local[question.id] ?? restored[question.id])));
          setCurrentIndex(first < 0 ? draftQuestions.length - 1 : first);
        }
        setTimerError(null);
        setSessionReady(true);
      } catch (error) {
        if (!cancelled) setTimerError(t(getAssessmentSubmitErrorKey(error)));
      }
    })();

    return () => { cancelled = true; };
  }, [loadState, draftQuestions, draftLocked, assessmentId, token, preview, t, startRetry, titleAccepted]);

  useEffect(() => {
    if (!deadline) return;
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [deadline]);

  useEffect(() => {
    if (preview || !attemptId || secondsLeft !== 0 || expired || submitState.status === 'done' || submitState.status === 'submitting') return;
    let cancelled = false;
    void startAssessmentAttempt(assessmentId, token, true, attemptId).then((attempt) => {
      if (cancelled) return;
      if (attempt.status === 'pending_review' || (attempt.status === 'completed' && timeLimit && attempt.completedAt
        && Date.parse(attempt.completedAt) - Date.parse(attempt.startedAt) < timeLimit * 60_000)) {
        window.location.assign(`/learn/attempts/${attempt.id}`);
      } else if (attempt.status === 'completed') {
        setExpired(true);
      }
    }).catch(() => {
      if (!cancelled) setTimerError(t('assessments.saveInterrupted'));
    });
    return () => { cancelled = true; };
  }, [assessmentId, attemptId, expiryRetry, expired, preview, secondsLeft, submitState.status, t, timeLimit, token]);

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function changeAnswer(questionId: string, value: SelectedAnswers[string]) {
    setSelected((previous) => ({ ...previous, [questionId]: value }));
    if (!preview) draft.change(questionId, value);
  }

  function toggleMarked(questionId: string) {
    const next = marked.includes(questionId) ? marked.filter((id) => id !== questionId) : [...marked, questionId];
    setMarked(next);
    if (!attemptId) return;
    try {
      if (next.length) localStorage.setItem(`assessment-marked:${attemptId}`, JSON.stringify(next));
      else localStorage.removeItem(`assessment-marked:${attemptId}`);
    } catch {
      // Markers are still available until the page is closed.
    }
  }

  function selectSingle(questionId: string, optionId: string) {
    changeAnswer(questionId, optionId);
  }

  function selectMultiple(questionId: string, optionId: string, checked: boolean) {
    const current = selectedIds(selected[questionId]);
    changeAnswer(questionId, checked ? [...current, optionId] : current.filter((id) => id !== optionId));
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
      draft.acknowledge(question.id);
      const answer = result.answer;
      setSelected((previous) => ({ ...previous, [question.id]: answer.response ?? answer.selectedOptionIds ?? answer.selectedOptionId ?? '' }));
    } catch (error) {
      setSubmitState({ status: 'error', message: t(!preview && error instanceof TypeError
        ? 'assessments.saveInterrupted' : getAssessmentSubmitErrorKey(error)) });
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadState.status !== 'loaded' || loadState.data.questions.some((question) => !supportsTakingQuestion(question))) return;

    const answeredQuestions = loadState.data.questions.slice(preview?.startIndex ?? 0);
    const answeredCount = countAnsweredQuestions(answeredQuestions, selected);
    if (secondsLeft === 0 || !sessionReady || (requiresLockedAnswers(loadState.data.assessment.policy)
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
      const attempt = await createAssessmentAttempt(assessmentId, buildAssessmentAnswers(loadState.data.questions, selected), token, attemptId);
      const result = await getAttemptResult(attempt.id);
      const limit = loadState.data.assessment.timeLimitMinutes;
      if (limit && result.status === 'completed' && !result.passed && result.completedAt
        && Date.parse(result.completedAt) - Date.parse(result.startedAt) >= limit * 60_000) {
        draft.clear();
        setExpired(true);
        return;
      }

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

      draft.clear();
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
    return <PageState title={t('assessments.takeTitle')} message={timerError} variant="error"
      action={<button type="button" className="learner-btn learner-btn--secondary" onClick={() => {
        setTimerError(null);
        if (secondsLeft === 0) setExpiryRetry((value) => value + 1);
        else setStartRetry((value) => value + 1);
      }}>{t('assessments.retrySave')}</button>} />;
  }

  const { assessment, questions } = loadState.data;
  const presentation = assessment.presentation;
  const theme = presentation?.theme;
  const themeStyle = theme ? {
    '--assessment-accent': theme.accent,
    '--assessment-on-accent': theme.accent ? assessmentAccentContrast(theme.accent).foreground : undefined,
    '--assessment-heading-font': theme.headingFont ? assessmentFonts[theme.headingFont] : undefined,
    fontFamily: theme.bodyFont ? assessmentFonts[theme.bodyFont] : undefined,
  } as CSSProperties : undefined;
  const finalPresentation = submitState.status === 'done' ? submitState.result.assessment.presentation : presentation;
  const finalMode = finalPresentation?.finalScreen ?? 'results';
  const showTitle = presentation?.titleScreen && !titleAccepted && !preview?.startIndex;

  if (showTitle) return <div className="learner-quiz" style={themeStyle}>
    <h1>{assessment.title}</h1>
    {assessment.description && <RichText value={assessment.description} />}
    <AssessmentMaterial value={assessment.material} />
    <button type="button" className="learner-btn learner-btn--primary" style={touchTarget} onClick={() => setTitleAccepted(true)}>
      {t('assessments.startBtn')}
    </button>
  </div>;

  if ((expired || submitState.status === 'done') && finalMode === 'none') {
    return preview ? null : <Navigate to={backLink} replace />;
  }

  if ((expired || submitState.status === 'done') && finalMode === 'message') {
    const message = finalPresentation?.completionMessage;
    return <div className="learner-quiz" style={themeStyle}>
      <h1>{t('assessments.presentation.completed')}</h1>
      {message && <RichText value={message} />}
      {!preview && <a className="learner-btn learner-btn--primary" href={backLink}>{t('assessments.backToAssessment')}</a>}
    </div>;
  }

  if (expired) return <PageState title={t('assessments.timerExpired')} message={t('assessments.timeEnded')}
    action={<a href={`/learn/attempts/${attemptId}`}>{t('assessments.attemptsHistoryReview')}</a>} />;

  const locked = requiresLockedAnswers(assessment.policy);
  const noBack = assessment.policy?.preventBacktracking;
  const allQuestions = assessment.policy?.oneQuestion === false && !locked;
  const progress = questions.length ? Math.round(countAnsweredQuestions(questions, selected) * 100 / questions.length) : 0;
  if (questions.some((question) => !supportsTakingQuestion(question))) {
    return <PageState title={assessment.title} message={t('assessments.typedQuestionUnavailable')} variant="error" action={<a href="/learn/assessments">{t('assessments.navLink')}</a>} />;
  }

  if (submitState.status === 'done') {
    const { result, certificateId } = submitState;
    // PR 540: a survey has no score and no verdict, so the employee only sees that the answers are in.
    if (assessment.mode === 'survey') return <div className="learner-quiz" style={themeStyle}>
      {!preview && <nav className="learner-breadcrumb">
        <a href="/learn/assessments">{t('assessments.navLink')}</a>
        <span>›</span>
        <span>{assessment.title}</span>
      </nav>}
      <div className="learner-quiz__result-banner learner-quiz__result-banner--passed" role="status">
        <span className="learner-quiz__result-label">{t('assessments.survey.thanks')}</span>
      </div>
      <div className="learner-quiz__result-actions">
        {!preview && <a className="learner-btn learner-btn--primary" href="/learn/assessments">{t('assessments.survey.toList')}</a>}
        {preview && <button className="learner-btn learner-btn--secondary" type="button"
          onClick={() => { setSelected({}); setRecorded({}); setCurrentIndex(preview.startIndex); setSubmitState({ status: 'idle' }); }}>
          {t('assessments.retryBtn')}
        </button>}
      </div>
    </div>;
    if (result.status === 'pending_review') return <div className="learner-quiz" style={themeStyle}>
      <p role="status">{t('assessmentReview.pending')}</p>
      {result.id && <a href={`/learn/attempts/${result.id}`}>{t('assessments.attemptsHistoryReview')}</a>}
    </div>;
    return (
      <div className="learner-quiz" style={themeStyle}>
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
                        <AssessmentMaterial value={answer.question.material} />
                        {(answer.question.options ?? []).map((option) => <AssessmentMaterial key={option.id} value={option.material} />)}
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
              onClick={() => { if (!preview) { window.location.assign(backLink + '/take' + assessmentTokenQuery(token)); return; }
                setSelected({}); setRecorded({}); setCurrentIndex(preview.startIndex); setSubmitState({ status: 'idle' }); }}
            >
              {t('assessments.retryBtn')}
            </button>
          ) : null}
        </div>
      </div>
    );
  }


  return (
    <div className="learner-quiz" style={themeStyle}>
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
            {assessment.mode === 'survey'
              ? t('assessments.survey.subtitleTaking', { current: currentIndex + 1, total: questions.length })
              : t('assessments.subtitleTaking', { current: currentIndex + 1, total: questions.length, score: assessment.passingScore })}
          </p>
          {presentation?.titleScreen === undefined && <AssessmentMaterial value={assessment.material} />}
        </div>
      </section>

      <section style={{ position: 'sticky', top: 64, zIndex: 2, marginBottom: 16, padding: 10,
        borderRadius: 10, background: 'var(--color-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span>{t('assessments.answeredCount', { count: countAnsweredQuestions(questions, selected), total: questions.length })}</span>
          {secondsLeft !== null && <span role="timer">{t('assessments.timerLabel')} {formatTime(secondsLeft)}</span>}
          <a href="#assessment-question-navigator" style={{ ...touchTarget, display: 'inline-flex', alignItems: 'center' }}>{t('assessments.questionNavTitle')}</a>
        </div>
        {draft.failed && <div role="status">
          {t('assessments.saveInterrupted')}{' '}
          <button className="learner-btn learner-btn--secondary" style={touchTarget} type="button" onClick={draft.retry}>{t('assessments.retrySave')}</button>
        </div>}
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
          <form className="learner-quiz__form" style={{ minWidth: 0, overflowWrap: 'anywhere' }} onSubmit={handleSubmit}>
            <ol className="learner-quiz__questions" start={allQuestions ? 1 : currentIndex + 1}>
              {(allQuestions ? questions.map((_, index) => index) : [currentIndex]).map((index) => {
              const question = questions[index];
              const checkedAnswer = recorded[question.id];
              const value = selected[question.id];
              const isAnswered = isQuestionAnswered(question, value);
              return (
                  <li key={question.id} id={`assessment-question-${question.id}`} style={{ scrollMarginTop: 160 }} className={`learner-quiz__question ${isAnswered ? 'learner-quiz__question--answered' : ''}`}>
                    <div className="learner-quiz__question-header">
                      <span className="learner-quiz__question-num">{index + 1}</span>
                      <h3 className="learner-quiz__question-title">{question.title}</h3>
                      <span className="learner-quiz__question-points">{question.points} pt</span>
                    </div>
                    {question.text ? <p className="learner-quiz__question-text"><RichText value={question.text} /></p> : null}

                    {!noBack && <button className="learner-btn learner-btn--secondary" style={touchTarget} type="button"
                      aria-pressed={marked.includes(question.id)} onClick={() => toggleMarked(question.id)}>{t('assessments.markForReturn')}</button>}
                    <AssessmentMaterial value={question.material} />
                    {question.imageUrl && <img src={question.imageUrl} alt={question.title} style={{ maxWidth: '100%', maxHeight: 360 }} />}
                    <fieldset disabled={checking || !!checkedAnswer || !sessionReady || secondsLeft === 0} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                    {question.definition ? <QuestionResponseFields question={question}
                      answer={typeof value === 'object' && !Array.isArray(value) ? { questionId: question.id, response: value } : null}
                      onChange={({ response }) => { if (response) changeAnswer(question.id, response); }} />
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
                              <label className="learner-quiz__option-label" style={touchTarget}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => selectMultiple(question.id, option.id, e.target.checked)}
                                />
                                <span>{option.material && !option.imageUrl && !option.text ? t('longreadExercises.option', { number: index + 1 }) : label}</span>
                              </label>
                              <AssessmentMaterial value={option.material} />
                            </li>
                          );
                        }
                        const checked = selected[question.id] === option.id;
                        return (
                          <li key={option.id} className={`learner-quiz__option ${checked ? 'learner-quiz__option--selected' : ''}`}>
                            <label className="learner-quiz__option-label" style={touchTarget}>
                              <input
                                type="radio"
                                name={question.id}
                                checked={checked}
                                onChange={() => selectSingle(question.id, option.id)}
                              />
                              <span>{option.material && !option.imageUrl && !option.text ? t('longreadExercises.option', { number: index + 1 }) : label}</span>
                            </label>
                            <AssessmentMaterial value={option.material} />
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
                      <button className="learner-btn learner-btn--primary" style={touchTarget} type="button"
                        disabled={checking || !sessionReady || secondsLeft === 0 || !isQuestionAnswered(questions[currentIndex], selected[questions[currentIndex].id])}
                        onClick={() => void checkAnswer(questions[currentIndex])}>{t('assessments.policy.checkAnswer')}</button>
                    ) : allQuestions || currentIndex === questions.length - 1 ? (
                      <button
                        className="learner-btn learner-btn--primary"
                        style={touchTarget}
                        disabled={submitState.status === 'submitting' || !sessionReady || secondsLeft === 0}
                        type="submit"
                      >
                        {submitState.status === 'submitting' ? t('assessments.submitting') : t('assessments.submitBtn')}
                      </button>
                    ) : (
                      <button
                        className="learner-btn learner-btn--primary"
                        style={touchTarget}
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
          <aside style={{ position: 'sticky', top: 160, maxHeight: 'calc(100dvh - 160px)', overflow: 'auto', scrollMarginTop: 160 }} id="assessment-question-navigator" aria-labelledby="assessment-question-navigator-title">
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '20px', boxShadow: '0 8px 24px rgba(23,32,51,.05)', padding: '24px' }}>
              <h3 id="assessment-question-navigator-title" style={{ margin: '0 0 16px', fontSize: '18px', color: 'var(--color-text)' }}>{t('assessments.questionNavTitle')}</h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(44px, 1fr))', gap: '8px' }}>
                {questions.map((q, i) => {
                  const isDone = isQuestionAnswered(q, selected[q.id]);
                  const isCurrent = i === currentIndex;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      aria-current={isCurrent ? 'step' : undefined}
                      aria-label={t('assessments.questionNavItem', { number: i + 1, status: t(isDone ? 'assessments.legendAnswered' : 'assessments.legendNoAnswer') }) + (marked.includes(q.id) ? ` · ${t('assessments.markForReturn')}` : '')}
                      disabled={checking || (noBack && i !== currentIndex)
                        || (locked && i > currentIndex && (i !== currentIndex + 1 || !recorded[questions[currentIndex].id]))}
                      onClick={() => {
                        setCurrentIndex(i);
                        requestAnimationFrame(() => document.getElementById(`assessment-question-${q.id}`)?.scrollIntoView({ block: 'start' }));
                      }}
                      style={{
                        border: `1px solid ${isCurrent ? 'var(--color-primary)' : isDone ? '#b7ead6' : 'var(--color-border)'}`,
                        background: isCurrent ? 'var(--assessment-accent, var(--color-primary))' : isDone ? 'var(--color-success-bg)' : 'var(--color-surface)',
                        color: isCurrent ? 'var(--assessment-on-accent, var(--color-on-primary))' : isDone ? 'var(--color-success)' : 'var(--color-text)',
                        borderRadius: '10px',
                        minHeight: '44px',
                        fontWeight: 700,
                        fontSize: '14px',
                        cursor: 'pointer',
                      }}
                    >
                      {i + 1}{marked.includes(q.id) ? ' ⚑' : ''}
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

            </div>
          </aside>


        </div>
      )}
    </div>
  );
}
