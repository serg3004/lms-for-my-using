import { RichText } from '../shared/RichText.js';
import { checklistResultText } from '../shared/checklistResultText.js';
import { checklistNumbers } from '@lms/shared/checklist-numbering';
import { RichDescription } from '../shared/RichDescription.js';
import { readFeedbackAnswers, isCustomFeedback, firstMissingRequiredFeedback } from '@lms/shared/checklist-feedback';
import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { TFunction } from 'i18next';
import { ApiClientError } from '../shared/apiClient.js';
import { uploadChecklistItemPhotoWithProgress } from '../shared/apiClient.js';
import { CHECKLIST_PHOTO_ACCEPT, checklistPhotoErrorMessage, checklistPhotoHint, validateChecklistPhoto } from '../shared/checklistPhoto.js';
import { clearChecklistItemAnswer, getChecklistInstance, removeChecklistItemPhoto, skipChecklistItem, submitChecklistItemResult } from '../shared/api/checklists.js';
import { ChecklistPhotoProof } from './ChecklistPhotoProof.js';
import {
  captureChecklistSessionLocation,
  getConductChecklistSession,
  submitChecklistSessionContext,
  submitChecklistSessionFeedback,
  transitionChecklistSession,
} from '../shared/api/checklistSessions.js';
import type {
  ChecklistInstanceSummary,
  ChecklistItemResultSummary,
  ChecklistItemSummary,
  ChecklistSession,
  ChecklistSessionSummary,
} from '../shared/api/types.js';
import { CHECKLIST_SESSION_STATUS_BADGE_VARIANT } from '../shared/checklistStatus.js';
import { Avatar, Badge, Button, InlineFeedback, PageState, ProgressBar } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { DEFAULT_LEVEL_COLORS, defaultLevelColor, levelPaint, NEUTRAL_LEVEL_COLOR } from '../shared/levelPaint.js';
import { PastSessions } from './ChecklistSessionHistory.js';
import { ChecklistConductOverview } from './ChecklistConductOverview.js';
import { ChecklistItemDescription } from './ChecklistItemNote.js';
import { ChecklistPhotoStrip } from '../shared/ChecklistPhotoStrip.js';
import { AppearanceBlock, itemCardStyle } from '../shared/AppearanceBlock.js';
import { resolveBlockStyle, isEmptyBlockStyle, type Appearance } from '@lms/shared/checklist-appearance';
import { isNoteRequired, pendingAnswer } from './checklistItemNote.js';
import { conductCriteria, nextConductStep } from './checklistConductOverview.js';
import { localizeChecklistScaleError, checklistResultToAnswer, getRequiredChecklistProgress, isChecklistAnswerComplete } from './checklistCompletion.js';

import { RichFillField } from './ChecklistItemNote.js';
import { ContextFields, CriterionHeading, FeedbackFields, type FeedbackDraft } from './ChecklistConductFields.js';

const COLORS = {
  surface: 'var(--color-surface)',
  soft: 'var(--color-surface-muted)',
  text: 'var(--color-text)',
  muted: 'var(--color-text-muted)',
  border: 'var(--color-border)',
  primary: 'var(--color-primary)',
  success: 'var(--color-success)',
  successSoft: 'var(--color-success-bg)',
};


type ConductData = { session: ChecklistSessionSummary; instance: ChecklistInstanceSummary };

export type LocationCaptureOutcome = 'off' | 'captured' | 'denied' | 'unavailable';

/**
 * One-shot browser geolocation capture, per PR 290's "getCurrentPosition once, never
 * watchPosition" contract. Every outcome (captured/denied/unavailable) is POSTed -- a denial is
 * itself a valid, auditable outcome, never a silent skip. A 409 (this capture point already
 * exists) is swallowed: it only means an earlier attempt already recorded it. The outcome is
 * also returned (not just posted) so the caller can tell the observer what happened -- PR 306:
 * previously this was fire-and-forget, so a denied/unavailable capture was invisible to the
 * person conducting the session.
 *
 * `GeolocationPositionError.code` distinguishes an actual permission refusal
 * (`PERMISSION_DENIED`) from every other failure (`POSITION_UNAVAILABLE`, `TIMEOUT`) -- only the
 * former is a "denied" in the sense the backend's `denied` status describes; anything else is
 * reported as `unavailable`, same as the browser having no geolocation API at all. Collapsing
 * both into `denied` (as an earlier version of this function did) mislabels a GPS/timeout failure
 * as a permission refusal in the audit trail.
 */
export async function captureLocationBestEffort(
  sessionId: string,
  point: 'start' | 'end',
  policy: string,
): Promise<LocationCaptureOutcome> {
  if (policy === 'off') return 'off';
  if (!('geolocation' in navigator)) {
    await captureChecklistSessionLocation(sessionId, point, { status: 'unavailable' }).catch(() => undefined);
    return 'unavailable';
  }
  return new Promise<LocationCaptureOutcome>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        captureChecklistSessionLocation(sessionId, point, {
          status: 'captured',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        })
          .catch(() => undefined)
          .finally(() => resolve('captured'));
      },
      (positionError) => {
        const outcome: LocationCaptureOutcome = positionError.code === positionError.PERMISSION_DENIED ? 'denied' : 'unavailable';
        captureChecklistSessionLocation(sessionId, point, { status: outcome })
          .catch(() => undefined)
          .finally(() => resolve(outcome));
      },
      { timeout: 10_000 },
    );
  });
}

export type GeoNotice = { tone: 'warning' | 'error'; message: string } | null;

/**
 * PR 306: pure message selection for a geolocation capture outcome, factored out of
 * `ConductScreen` so it's unit-testable without an interactive render (jsdom doesn't support
 * the DOM APIs this screen's other interactions would need). `off`/`captured` clear any prior
 * notice; `denied`/`unavailable` explain what happened, and under a `required` policy add that
 * an admin can record an audited override on the observer's behalf (the only capture path that
 * actually exists for that case -- see `captureChecklistSessionLocation`'s `overrideReason`).
 */
export function describeGeoNotice(outcome: LocationCaptureOutcome, policy: string, t: TFunction): GeoNotice {
  if (outcome === 'off' || outcome === 'captured') return null;

  const deniedOrUnavailable =
    outcome === 'denied'
      ? t('checklistSessions.conduct.geoDenied', 'Location access was denied for this session.')
      : t('checklistSessions.conduct.geoUnavailable', 'Location could not be determined for this session.');
  const message =
    policy === 'required'
      ? `${deniedOrUnavailable} ${t('checklistSessions.conduct.geoRequiredHint', 'An admin can record it on your behalf.')}`
      : deniedOrUnavailable;
  return { tone: policy === 'required' ? 'error' : 'warning', message };
}

/**
 * Shared mutation-error handling for every session/item action on this screen (transitions, item
 * results/skip/photo, structured feedback): a 409 always means the caller's local copy of the
 * session/instance is stale, so it's routed to `onConflict` instead of the generic error message,
 * regardless of which specific call raised it.
 */
export async function runMutation(
  fn: () => Promise<unknown>,
  handlers: { setBusy: (busy: boolean) => void; setError: (message: string | null) => void; onConflict: () => void; fallbackMessage: string },
) {
  handlers.setBusy(true);
  handlers.setError(null);
  try {
    await fn();
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 409) {
      handlers.onConflict();
    } else {
      handlers.setError(err instanceof ApiClientError ? err.message : handlers.fallbackMessage);
    }
  } finally {
    handlers.setBusy(false);
  }
}

/**
 * PR 297/319: mobile-first "Observer conducts a session" screen, reached from its own route
 * (`/instructor/checklists/sessions/:id`, PR 319 -- previously embedded as a tab inside
 * InstructorChecklistReviewsPage). A session and its underlying ChecklistInstance are separate id
 * spaces (docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md) -- item results/skip/photo all
 * go through the instance, the lifecycle (start/pause/resume/complete) and structured feedback
 * through the session.
 */
/** Complete is open once every required criterion is answered, or always on a checklist that allows finishing incomplete (PR 330). */
export function canCompleteSession(status: string, allowFinishIncomplete: boolean, completedRequired: number, requiredCount: number) {
  return status === 'in_progress' && (allowFinishIncomplete || completedRequired === requiredCount);
}

export async function fetchConductData(sessionId: string): Promise<ConductData> {
  const session = await getConductChecklistSession(sessionId);
  const instance = await getChecklistInstance(session.instanceId);
  return { session, instance };
}

/**
 * PR 319: the criterion stepper's step space is every checklist item plus one trailing
 * "structured feedback" step -- pure and unit-testable on its own so the stepping logic doesn't
 * need a full interactive render to verify (this file's other components are driven by
 * `renderToStaticMarkup`, which can't click through steps).
 */
export function resolveConductStep(itemCount: number, requestedIndex: number, hasContext = false, hasFeedback = true) {
  const totalSteps = itemCount + (hasFeedback ? 1 : 0) + (hasContext ? 1 : 0);
  const boundedIndex = Math.min(Math.max(requestedIndex, 0), totalSteps - 1);
  const itemIndex = boundedIndex - (hasContext ? 1 : 0);
  return {
    boundedIndex,
    itemIndex,
    totalSteps,
    isContextStep: hasContext && boundedIndex === 0,
    isFeedbackStep: hasFeedback && boundedIndex === totalSteps - 1,
    isLastStep: boundedIndex === totalSteps - 1,
  };
}

export function ChecklistSessionConduct({ sessionId, onBack, t }: { sessionId: string; onBack: () => void; t: TFunction }) {
  const { state, reload, mutate } = useAsyncData<ConductData>(
    () => fetchConductData(sessionId),
    [sessionId],
    {
      unauthenticated: t('checklistSessions.conduct.sessionExpired', 'Your session expired. Sign in again.'),
      notFound: t('checklistSessions.conduct.notFound', 'This session no longer exists or you no longer have access to it.'),
      error: t('checklistSessions.conduct.loadError', 'Unable to load this session.'),
    },
  );

  if (state.status === 'loading') {
    return <PageState message={t('checklistSessions.conduct.loading', 'Loading your sessions...')} variant="loading" />;
  }
  if (state.status === 'unauthenticated' || state.status === 'notFound' || state.status === 'error') {
    return <PageState title={t('checklistSessions.conduct.title', 'Sessions')} message={state.message} variant="error" />;
  }

  return <ConductScreen data={state.data} onBack={onBack} onReload={reload} onMutate={mutate} t={t} />;
}

export function ConductScreen({
  data,
  onBack,
  onReload,
  onMutate,
  t,
}: {
  data: ConductData;
  onBack: () => void;
  onReload: () => Promise<void>;
  onMutate: (updater: (data: ConductData) => ConductData) => void;
  t: TFunction;
}) {
  const { session, instance } = data;
  const checklist = instance.checklist;
  const [stepIndex, setStepIndex] = useState(0);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [hideAnswered, setHideAnswered] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [feedbackDraft, setFeedbackDraft] = useState<FeedbackDraft>({ strengths: session.strengths ?? '', developmentAreas: session.developmentAreas ?? '', nextSteps: session.nextSteps ?? '', answers: readFeedbackAnswers(session) });
  const overviewId = useId();
  const stepHeading = useRef<HTMLParagraphElement>(null);
  const focusStep = useRef(false);
  useEffect(() => {
    if (!overviewOpen && focusStep.current) { stepHeading.current?.focus(); focusStep.current = false; }
  }, [stepIndex, overviewOpen]);
  useEffect(() => {
    setFeedbackDraft({ strengths: session.strengths ?? '', developmentAreas: session.developmentAreas ?? '', nextSteps: session.nextSteps ?? '', answers: readFeedbackAnswers({ feedbackAnswers: session.feedbackAnswers, strengths: session.strengths, developmentAreas: session.developmentAreas, nextSteps: session.nextSteps }) });
  }, [session.strengths, session.developmentAreas, session.nextSteps, session.feedbackAnswers]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [geoNotice, setGeoNotice] = useState<GeoNotice>(null);
  // Blocks Back/Pause/Next while the visible step's own save/upload is still in flight -- see the
  // comment on the old CriterionStepper for why serializing these matters. Lifted up from the
  // stepper (PR 319) since the bottom nav bar is now a page-level element, not the stepper's own.
  const [cardBusy, setCardBusy] = useState(false);
  const contextFields = [...(session.contextFieldsSnapshot ?? checklist?.contextFields ?? [])].sort((a, b) => a.order - b.order);
  const [contextValues, setContextValues] = useState<Record<string, string>>(session.contextValues ?? {});

  useEffect(() => setContextValues(session.contextValues ?? {}), [session.contextValues]);

  if (!checklist) return null;

  const items = checklist.items;
  const criteria = conductCriteria(items, instance.results, checklist.scoringMode);
  const unanswered = criteria.filter(({ state }) => state === 'unanswered');
  const navigationLocked = busy || cardBusy;
  // PR 368: a sheet can switch the trailing feedback step off (older snapshots read as on).
  const feedbackEnabled = checklist.feedbackEnabled !== false;
  const feedbackRequired = feedbackEnabled && checklist.feedbackRequired === true;
  const currentStep = resolveConductStep(items.length, stepIndex, contextFields.length > 0, feedbackEnabled);
  const editable = session.status === 'in_progress';

  async function transition(action: 'start' | 'pause' | 'resume' | 'complete') {
    const idempotencyKey = crypto.randomUUID();
    await runMutation(
      async () => {
        const updatedSession = await transitionChecklistSession(session.id, action, session.version, idempotencyKey);
        if (action === 'start') {
          const outcome = await captureLocationBestEffort(session.id, 'start', session.locationCapturePolicy);
          setGeoNotice(describeGeoNotice(outcome, session.locationCapturePolicy, t));
        }
        if (action === 'complete') {
          const outcome = await captureLocationBestEffort(session.id, 'end', session.locationCapturePolicy);
          setGeoNotice(describeGeoNotice(outcome, session.locationCapturePolicy, t));
        }
        // Merges the transition's own response into local state instead of a full onReload() --
        // a network reload flips the parent's AsyncDataState back to 'loading', which early-returns
        // and unmounts this whole screen (losing stepIndex, busy, geoNotice) for the split second
        // the refetch is in flight. Same fix as the criterion-level mutations below. The transition
        // endpoint returns the bare ChecklistSession row (no joined checklist/learner/observer/
        // result), so those projected fields -- which a lifecycle transition never changes -- come
        // from the previous session, not the response.
        onMutate((current) => ({ ...current, session: { ...current.session, ...updatedSession } }));
      },
      { setBusy, setError, onConflict: () => setConflict(true), fallbackMessage: t('checklistSessions.conduct.saveError', 'Unable to save.') },
    );
  }

  const { completedRequired, requiredCount } = getRequiredChecklistProgress(items, instance.results, checklist.scoringMode);
  // PR 330: on a checklist that allows finishing incomplete the client doesn't block Complete; the
  // server records the unanswered criteria as skipped.
  const allowFinishIncomplete = checklist.allowFinishIncomplete === true;
  const feedbackFilled = session.feedback && isCustomFeedback(session.feedback.layout) ? !firstMissingRequiredFeedback(session.feedback.layout, readFeedbackAnswers(session)) : Boolean(session.strengths?.trim() && session.developmentAreas?.trim());
  const feedbackSaved = !session.feedback || !isCustomFeedback(session.feedback.layout) || JSON.stringify(feedbackDraft.answers ?? {}) === JSON.stringify(readFeedbackAnswers(session));
  const canComplete = feedbackSaved && canCompleteSession(session.status, allowFinishIncomplete, completedRequired, requiredCount) && (session.feedback && isCustomFeedback(session.feedback.layout) ? feedbackFilled : !feedbackRequired || feedbackFilled);
  const contextComplete = contextFields.every((field) => !field.required || Boolean(contextValues[field.id]?.trim()));

  async function saveContextAndContinue(nextIndex: number) {
    await runMutation(
      async () => {
        const updated = await submitChecklistSessionContext(session.id, { values: contextValues, version: session.version });
        onMutate((current) => ({ ...current, session: { ...current.session, ...updated } }));
        focusStep.current = true;
        setStepIndex(nextIndex);
        setOverviewOpen(false);
      },
      { setBusy, setError, onConflict: () => setConflict(true), fallbackMessage: t('checklistSessions.conduct.saveError', 'Unable to save.') },
    );
  }

  async function navigateToStep(nextIndex: number) {
    if (navigationLocked) return;
    if (currentStep.isContextStep && nextIndex !== currentStep.boundedIndex) {
      if (contextComplete) await saveContextAndContinue(nextIndex);
      return;
    }
    focusStep.current = true;
    setStepIndex(nextIndex);
    setOverviewOpen(false);
  }

  if (conflict) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px' }}>
        <InlineFeedback
          tone="error"
          title={t('checklistSessions.conduct.staleTitle', 'This session changed elsewhere')}
          action={
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setConflict(false);
                void onReload();
              }}
            >
              {t('checklistSessions.conduct.reload', 'Reload')}
            </Button>
          }
        >
          {t('checklistSessions.conduct.staleMessage', 'Someone else updated this session. Reload to see the latest state before continuing.')}
        </InlineFeedback>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '12px 12px 32px' }}>
      <button
        type="button"
        onClick={onBack}
        disabled={navigationLocked}
        style={{ border: 'none', background: 'none', color: COLORS.primary, fontWeight: 600, cursor: 'pointer', padding: '8px 0', minHeight: 44 }}
      >
        ← {t('checklistSessions.conduct.backToList', 'My sessions')}
      </button>

      <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: COLORS.primary }}>
        {t('checklistSessions.conduct.eyebrow', 'Workplace training')}
      </p>
      <h1 style={{ margin: '2px 0 0', fontSize: 20 }}>{t('checklistSessions.conduct.screenTitle', 'Conduct session')}</h1>

      <AppearanceBlock appearance={checklist.appearance} kind="header" style={{ marginTop: 8 }}>
      <Header session={session} instance={instance} t={t} />
      {instance.checklist?.description && <p><RichDescription value={instance.checklist.description} /></p>}
      </AppearanceBlock>

      {/* PR 421: the sheet's extra pictures stay at hand during the pass. */}
      {(session.status === 'in_progress' || session.status === 'paused') && checklist.showSheetPhotos !== false && checklist.photos && checklist.photos.length > 0 && (
        <ChecklistPhotoStrip checklistId={checklist.id} photos={checklist.photos} title={checklist.title} collapsible />
      )}

      {error && (
        <p role="alert" style={{ color: 'var(--color-danger)', fontSize: 13 }}>
          {error}
        </p>
      )}

      {geoNotice && (
        <InlineFeedback tone={geoNotice.tone}>{geoNotice.message}</InlineFeedback>
      )}

      {session.status === 'scheduled' && (
        <Button type="button" disabled={busy} onClick={() => void transition('start')} style={{ width: '100%', minHeight: 44, marginTop: 12 }}>
          {t('checklistSessions.conduct.start', 'Start session')}
        </Button>
      )}

      {session.status === 'scheduled' && <PastSessions session={session} t={t} />}

      {(session.status === 'in_progress' || session.status === 'paused') && (() => {
        // PR 319: the step space is every criterion plus one trailing "structured feedback" step
        // (prototype has no reference for this -- the plan asks for feedback to be a step after
        // the last criterion instead of a permanently-visible block under the card). "Next" turns
        // into "Complete" only on that last step, gated by the same canComplete this screen already
        // computed for the old standalone Complete button.
        const { boundedIndex, itemIndex, isContextStep, isFeedbackStep, isLastStep } = currentStep;
        return (
          <>
            <div style={{ margin: '16px 0' }}>
              <ProgressBar
                value={completedRequired}
                max={requiredCount || 1}
                label={t('checklistSessions.conduct.progress', '{{completed}} / {{total}} required', { completed: completedRequired, total: requiredCount })}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <Button type="button" variant="secondary" disabled={navigationLocked} aria-expanded={overviewOpen} aria-controls={overviewId} onClick={() => setOverviewOpen((open) => !open)} style={{ minHeight: 44 }}>
                {t('checklistSessions.conduct.overview', 'Sheet overview')}
              </Button>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, fontSize: 13 }}>
                <input type="checkbox" className="admin-switch" style={{ minHeight: 19, padding: 0, borderColor: COLORS.muted }} checked={hideAnswered} disabled={navigationLocked} onChange={(event) => setHideAnswered(event.target.checked)} />
                {t('checklistSessions.conduct.hideAnswered', 'Hide answered')}
              </label>
            </div>
            <section id={overviewId} hidden={!overviewOpen} aria-label={t('checklistSessions.conduct.overview', 'Sheet overview')}>
              <p role="status" style={{ fontSize: 13 }}>{t('checklistSessions.conduct.overviewProgress', '{{completed}} of {{total}} addressed', { completed: items.length - unanswered.length, total: items.length })}</p>
              {isContextStep && !contextComplete && <p style={{ fontSize: 13, color: COLORS.muted }}>{t('checklistSessions.conduct.completeContextFirst', 'Complete the required general information before moving to a criterion.')}</p>}
              {overviewOpen && <ChecklistConductOverview criteria={criteria} groups={checklist.itemGroups ?? []} showNumbering={checklist.showNumbering} hideAnswered={hideAnswered} currentItemIndex={itemIndex} disabled={navigationLocked || (isContextStep && !contextComplete)} onSelect={(index) => void navigateToStep(index + (contextFields.length > 0 ? 1 : 0))} t={t} />}
              <Button type="button" variant="secondary" disabled={navigationLocked} onClick={() => { focusStep.current = true; setOverviewOpen(false); }} style={{ minHeight: 44, marginTop: 12 }}>
                {t('checklistSessions.conduct.returnToStep', 'Return to current step')}
              </Button>
            </section>

            <div hidden={overviewOpen}>
              <p ref={stepHeading} tabIndex={-1} style={{ fontSize: 12.5, color: COLORS.muted, fontWeight: 600, margin: '0 0 8px' }}>
                {isContextStep
                  ? t('checklistSessions.conduct.contextTitle', 'General information')
                  : isFeedbackStep
                  ? t('checklistSessions.conduct.feedbackTitle', 'Structured feedback')
                  : checklist.showNumbering === false ? t('checklistSessions.conduct.criterion', 'Criterion') : t('checklistSessions.conduct.criterionOf', 'Criterion {{index}} / {{total}}', { index: itemIndex + 1, total: items.length })}
              </p>

              {isContextStep ? (
                <AppearanceBlock appearance={checklist.appearance} kind="info">
                <ContextFields
                  fields={contextFields}
                  values={contextValues}
                  disabled={busy}
                  onChange={(fieldId, value) => setContextValues((current) => ({ ...current, [fieldId]: value }))}
                  t={t}
                />
                </AppearanceBlock>
              ) : isFeedbackStep ? (
                <StructuredFeedback
                  appearance={checklist.appearance}
                  session={session}
                  busy={busy}
                  draft={feedbackDraft}
                  onDraftChange={setFeedbackDraft}
                  onBusyChange={setCardBusy}
                  onSaved={(updatedSession) => onMutate((current) => ({ ...current, session: { ...current.session, ...updatedSession } }))}
                  onConflict={() => setConflict(true)}
                  t={t}
                />
              ) : (() => {
                const rawItem = items[itemIndex]!;
                // PR 368: the sheet-level "Skip" flag turns skipping on for every criterion.
                const currentItem = checklist.allowSkipAll === true && !rawItem.allowSkip ? { ...rawItem, allowSkip: true } : rawItem;
                const currentResult = instance.results.find((r) => r.itemId === currentItem.id);
                const isDone = isChecklistAnswerComplete(currentItem, checklist.scoringMode, checklistResultToAnswer(currentResult));
                const groupStyle = resolveBlockStyle(checklist.appearance, 'group', currentItem.groupId);
                const groupTitle = checklist.itemGroups?.find((group) => group.id === currentItem.groupId)?.title;
                return (
                  <>
                  {/* PR 422: the group is only named here when the author styled it, so sheets without appearance look as before. */}
                  {groupTitle && !isEmptyBlockStyle(groupStyle) && (
                    <AppearanceBlock appearance={checklist.appearance} kind="group" id={currentItem.groupId} style={{ marginBottom: 8 }}><strong><RichText value={groupTitle} /></strong></AppearanceBlock>
                  )}
                  <div
                    style={itemCardStyle(checklist.appearance, currentItem.id, {
                      border: `1px solid ${isDone ? COLORS.success : COLORS.border}`,
                      background: isDone ? COLORS.successSoft : COLORS.surface,
                      borderRadius: 14,
                      padding: 16,
                    }, COLORS.success, isDone)}
                  >
                    <CriterionCard
                      key={currentItem.id}
                      instanceId={instance.id}
                      item={currentItem}
                      number={checklist.showNumbering === false ? '' : checklistNumbers(items, checklist.itemGroups ?? []).itemNumbers.get(currentItem.id)}
                      result={currentResult}
                      comment={commentDrafts[currentItem.id] ?? currentResult?.comment ?? ''}
                      onCommentChange={(comment) => setCommentDrafts((current) => ({ ...current, [currentItem.id]: comment }))}
                      scoringMode={checklist.scoringMode}
                      scaleLevels={checklist.scaleLevels}
                      cameraOnly={checklist.forbidGalleryPhotos === true}
                      editable={editable}
                      onSaved={(updatedInstance) => onMutate((current) => ({ ...current, instance: updatedInstance }))}
                      onBusyChange={setCardBusy}
                      onConflict={() => setConflict(true)}
                      t={t}
                    />
                  </div>
                  </>
                );
              })()}

              {!canComplete && isLastStep && (
                <p style={{ color: COLORS.muted, fontSize: 12.5, marginTop: 10 }}>
                  {!feedbackSaved ? t('checklistSessions.conduct.saveFeedback') : session.feedback && isCustomFeedback(session.feedback.layout) && !feedbackFilled
                    ? t('feedbackBuilder.requiredFields')
                    : feedbackRequired && !feedbackFilled
                    ? t('checklistSessions.conduct.feedbackRequiredHint', 'Save the strengths and development areas before completing.')
                    : t('checklistSessions.conduct.incompleteHint', 'All required criteria must be answered before completing.')}
                </p>
              )}
              {isLastStep && unanswered.length > 0 && <div style={{ marginTop: 12 }}>
                <p role="status" style={{ fontSize: 13 }}>{t('checklistSessions.conduct.unansweredCount', 'Unanswered criteria: {{count}}', { count: unanswered.length })}</p>
                <Button type="button" variant="secondary" disabled={navigationLocked} onClick={() => void navigateToStep(unanswered[0]!.index + (contextFields.length > 0 ? 1 : 0))} style={{ minHeight: 44 }}>
                  {t('checklistSessions.conduct.firstUnanswered', 'Go to first unanswered')}
                </Button>
              </div>}
              {allowFinishIncomplete && editable && isLastStep && unanswered.length > 0 && (
                <p style={{ color: COLORS.muted, fontSize: 12.5, marginTop: 10 }}>
                  {t('checklistSessions.conduct.skipUnansweredHint', 'Criteria you have not answered will be recorded as skipped and left out of the result.')}
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={boundedIndex === 0 || navigationLocked}
                  onClick={() => void navigateToStep(boundedIndex - 1)}
                  style={{ flex: 1, minHeight: 44 }}
                >
                  {t('checklistSessions.conduct.back', 'Back')}
                </Button>
                {session.status === 'in_progress' ? (
                  <Button type="button" variant="secondary" disabled={navigationLocked} onClick={() => void transition('pause')} style={{ flex: 1, minHeight: 44 }}>
                    {t('checklistSessions.conduct.pause', 'Pause')}
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" disabled={navigationLocked} onClick={() => void transition('resume')} style={{ flex: 1, minHeight: 44 }}>
                    {t('checklistSessions.conduct.resume', 'Resume')}
                  </Button>
                )}
                {isLastStep ? (
                  <Button type="button" disabled={navigationLocked || !canComplete} onClick={() => void transition('complete')} style={{ flex: 1, minHeight: 44 }}>
                    {t('checklistSessions.conduct.complete', 'Complete')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={cardBusy || busy || (isContextStep && !contextComplete)}
                    onClick={() => void navigateToStep(nextConductStep(criteria, boundedIndex, contextFields.length > 0, hideAnswered))}
                    style={{ flex: 1, minHeight: 44 }}
                  >
                    {t('checklistSessions.conduct.next', 'Next')}
                  </Button>
                )}
              </div>
            </div>
          </>
        );
      })()}

      {session.status === 'completed' && feedbackEnabled && (
        <StructuredFeedback
          appearance={checklist.appearance}
          session={session}
          busy={busy}
          draft={feedbackDraft}
          onDraftChange={setFeedbackDraft}
          onBusyChange={setCardBusy}
          onSaved={(updatedSession) => onMutate((current) => ({ ...current, session: { ...current.session, ...updatedSession } }))}
          onConflict={() => setConflict(true)}
          t={t}
        />
      )}

      {session.status === 'completed' && instance.checklist?.scoringMode === 'none' && (
        <div style={{ marginTop: 20, borderRadius: 14, padding: '16px 18px', background: COLORS.successSoft }}>
          {t('checklists.finishedNoPointsDone', 'The check is completed')}
        </div>
      )}
      {session.status === 'completed' && instance.checklist?.scoringMode !== 'none' && (
        <div
          style={{
            marginTop: 20,
            borderRadius: 14,
            padding: '16px 18px',
            background: instance.passed ? COLORS.successSoft : COLORS.soft,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{instance.passed ? t('checklists.resultPassed', 'Passed') : t('checklists.resultNotPassed', 'Not passed')}</span>
          <strong>
            {checklistResultText(instance, true, t)}
          </strong>
        </div>
      )}
    </div>
  );
}

function Header({ session, instance, t }: { session: ChecklistSessionSummary; instance: ChecklistInstanceSummary; t: TFunction }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (session.status !== 'in_progress') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session.status]);

  const elapsedMs = session.startedAt
    ? (session.status === 'paused' && session.pausedAt ? new Date(session.pausedAt).getTime() : now) - new Date(session.startedAt).getTime()
    : 0;
  const elapsedLabel = session.startedAt ? formatElapsed(Math.max(0, elapsedMs)) : null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <Avatar firstName={session.learner.firstName} lastName={session.learner.lastName} size="lg" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 700, color: COLORS.text }}>
          {session.learner.firstName} {session.learner.lastName}
        </p>
        <p style={{ margin: 0, color: COLORS.muted, fontSize: 13 }}><RichText value={instance.checklist?.title ?? session.checklist.title} /></p>
      </div>
      <div style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
        <Badge variant={CHECKLIST_SESSION_STATUS_BADGE_VARIANT[session.status]} style={session.status === 'in_progress' ? { color: COLORS.text } : undefined}>
          {t(`checklistSessions.status.${session.status}`, session.status)}
        </Badge>
        {elapsedLabel && <span style={{ fontSize: 12, color: COLORS.muted, fontVariantNumeric: 'tabular-nums' }}>{elapsedLabel}</span>}
      </div>
    </div>
  );
}

export function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

// PR 415: a click on an answer that needs a required explanation waits until the explanation is filled.
function CriterionCard({
  number,
  instanceId,
  item,
  result,
  comment,
  onCommentChange,
  scoringMode,
  scaleLevels,
  cameraOnly,
  editable,
  onSaved,
  onBusyChange,
  onConflict,
  t,
}: {
  instanceId: string;
  item: ChecklistItemSummary;
  number?: string;
  result: ChecklistItemResultSummary | undefined;
  comment: string;
  onCommentChange: (comment: string) => void;
  scoringMode: string;
  scaleLevels: { level: number; label: string; description?: string; points?: number; color?: string }[] | null;
  cameraOnly: boolean;
  editable: boolean;
  onSaved: (instance: ChecklistInstanceSummary) => void;
  onBusyChange: (busy: boolean) => void;
  onConflict: () => void;
  t: TFunction;
}) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [heldAnswer, setHeldAnswer] = useState<{ checked?: boolean; scaleLevel?: number } | null>(null);
  const hasScale = Boolean(item.scale) || scoringMode === 'scale';
  const shownAnswer = heldAnswer ? pendingAnswer(heldAnswer) : checklistResultToAnswer(result);
  const noteRequired = isNoteRequired(item, shownAnswer, hasScale);
  // Combines this card's own save state with the photo upload's (tracked separately below, since
  // it doesn't go through run()) so the parent stepper can block navigation during either -- see
  // CriterionStepper's cardBusy comment for why that matters.
  const busy = saving || uploading;

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  async function run(fn: () => Promise<ChecklistInstanceSummary>) {
    await runMutation(
      async () => {
        const updated = await fn();
        onSaved(updated);
      },
      { setBusy: setSaving, setError: (message) => setError(localizeChecklistScaleError(message, t)), onConflict, fallbackMessage: t('checklistSessions.conduct.saveError', 'Unable to save.') },
    );
  }

  const canAct = editable && !busy;
  const levelList: { value: number; label: string; description?: string; points: number; color?: string }[] | null = item.scale
    ? item.scale.levels.map((level) => ({ value: level.value, label: level.label, description: 'description' in level && typeof level.description === 'string' ? level.description : undefined, points: level.score ?? 0, color: level.color }))
    : scoringMode === 'scale'
      ? (scaleLevels ?? []).map((level) => ({ value: level.level, label: level.label, description: level.description, points: level.points ?? 0, color: level.color }))
      : null;
  const bestPoints = Math.max(0, ...(levelList ?? []).map((level) => level.points));
  const hasAnswer = result?.answerState === 'answered' || (result?.answerState === undefined && (result?.checked === true || result?.scaleLevel != null));
  function clear() {
    setHeldAnswer(null);
    setCleared(true);
    void run(() => clearChecklistItemAnswer(instanceId, item.id));
  }
  function choose(input: { checked?: boolean; scaleLevel?: number }) {
    setCleared(false);
    if (isNoteRequired(item, pendingAnswer(input), hasScale) && !comment.trim()) {
      setHeldAnswer(input);
      return;
    }
    setHeldAnswer(null);
    void run(() => submitChecklistItemResult(instanceId, item.id, comment !== (result?.comment ?? '') ? { ...input, comment } : input));
  }

  return (
    <div>
      <CriterionHeading text={item.text} number={number} required={item.isRequired} t={t} />
      <ChecklistItemDescription item={item} t={t} />

      {error && (
        <p role="alert" style={{ color: 'var(--color-danger)', fontSize: 12.5 }}>
          {error}
        </p>
      )}

      {levelList ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {levelList.map((level) => {
            const selected = result?.scaleLevel === level.value;
            // PR 425: the chosen level is washed with its own colour (else the default by score); tick + thick border are the non-colour cue.
            const paint = selected ? levelPaint(scoringMode === 'none' ? NEUTRAL_LEVEL_COLOR : level.color ?? defaultLevelColor(level.points, bestPoints)) : null;
            return (
              <button
                key={level.value}
                aria-pressed={selected}
                type="button"
                disabled={!canAct}
                onClick={() => (selected ? clear() : choose({ scaleLevel: level.value }))}
                style={{
                  borderWidth: 2,
                  borderStyle: 'solid',
                  borderColor: paint?.borderColor ?? COLORS.border,
                  background: paint?.background ?? COLORS.surface,
                  color: paint?.color ?? COLORS.text,
                  fontWeight: selected ? 600 : undefined,
                  borderRadius: 10,
                  padding: '9px 13px',
                  fontSize: 13,
                  minHeight: 44,
                  cursor: canAct ? 'pointer' : 'default',
                }}
              >
                {selected && <span aria-hidden="true">✓ </span>}
                {level.label}
                {level.description && <RichDescription value={level.description} />}
              </button>
            );
          })}
        </div>
      ) : (
        <label
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, minHeight: 44, boxSizing: 'border-box', padding: '4px 12px', borderRadius: 10,
            borderWidth: 2, borderStyle: 'solid', borderColor: 'transparent', ...(result?.checked ? levelPaint(scoringMode === 'none' ? NEUTRAL_LEVEL_COLOR : DEFAULT_LEVEL_COLORS.full) : {}),
          }}
        >
          <input
            type="checkbox"
            checked={result?.checked ?? false}
            disabled={!canAct}
            onChange={(e) => choose({ checked: e.target.checked })}
          />
          {t('checklists.markDone', 'Done')}
        </label>
      )}
      {hasAnswer && (
        <Button type="button" size="sm" variant="ghost" disabled={!canAct} onClick={clear}>
          {t('checklistSessions.conduct.clearAnswer', 'Clear answer')}
        </Button>
      )}
      {cleared && !hasAnswer && <p role="status" className="admin-form__hint">{t('checklistSessions.conduct.answerCleared', 'Answer cleared: the criterion is unanswered again.')}</p>}

      <div style={{ marginTop: 12 }}>
        <RichFillField
          id={`conduct-comment-${item.id}`}
          label={noteRequired ? t('checklists.noteRequired', 'Explanation (required)') : t('checklistSessions.conduct.comment', 'Comment')}
          hint={heldAnswer ? t('checklists.notePending', 'Fill in the explanation and save it: your answer is saved together with it.') : undefined}
          required={noteRequired}
          value={comment}
          disabled={!editable}
          onChange={onCommentChange}
          maxLength={1000}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canAct || (comment === (result?.comment ?? '') && !heldAnswer) || (noteRequired && !comment.trim())}
          onClick={() => {
            const held = heldAnswer;
            setHeldAnswer(null);
            void run(() => submitChecklistItemResult(instanceId, item.id, held ? { ...held, comment } : { comment }));
          }}
          style={{ marginTop: 6, minHeight: 44 }}
        >
          {noteRequired ? t('checklists.noteSave', 'Save explanation') : t('checklistSessions.conduct.saveComment', 'Save comment')}
        </Button>
      </div>

      {item.photoRequired && (
        <PhotoAttachment
          instanceId={instanceId}
          item={item}
          result={result}
          cameraOnly={cameraOnly}
          editable={editable}
          busy={saving}
          onUploadingChange={setUploading}
          onUploaded={onSaved}
          onError={setError}
          onConflict={onConflict}
          t={t}
        />
      )}

      {item.allowSkip && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!canAct}
          onClick={() => void run(() => skipChecklistItem(instanceId, item.id, {}))}
          style={{ marginTop: 10, minHeight: 44 }}
        >
          {t('checklistSessions.conduct.skip', 'Skip')}
        </Button>
      )}
    </div>
  );
}

function PhotoAttachment({
  instanceId,
  item,
  result,
  cameraOnly,
  editable,
  busy,
  onUploadingChange,
  onUploaded,
  onError,
  onConflict,
  t,
}: {
  instanceId: string;
  item: ChecklistItemSummary;
  result: ChecklistItemResultSummary | undefined;
  cameraOnly: boolean;
  editable: boolean;
  busy: boolean;
  onUploadingChange: (uploading: boolean) => void;
  onUploaded: (instance: ChecklistInstanceSummary) => void;
  onError: (message: string) => void;
  onConflict: () => void;
  t: TFunction;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  // PR 406а: no thumbnail here either; the picture opens in a dialog on request (ChecklistPhotoProof).
  // (Earlier note: deliberately never renders an `<img>` thumbnail (neither the already-uploaded photo fetched
  // back from the API nor a local-file blob: preview): every value this component could put into
  // an `<img src>` -- a signed URL fetched from our API, and even a same-origin blob: URL created
  // via URL.createObjectURL() and gated on an explicit protocol check -- still tripped CodeQL's
  // XSS query in this file regardless of how it was re-derived or sanitized. A checkmark/progress
  // indicator conveys the same information (nothing attached / uploading / attached) without ever
  // binding a DOM sink to a non-literal value. ChecklistReviewPhotoEvidence.tsx (the async
  // post-submission review queue) still renders the real photo for review.
  const attached = Boolean(result?.photoFileName);

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const invalid = validateChecklistPhoto(file);
    if (invalid) { onError(checklistPhotoErrorMessage(invalid, t)); return; }
    setProgress(0);
    onUploadingChange(true);
    try {
      const updated = (await uploadChecklistItemPhotoWithProgress(instanceId, item.id, file, setProgress)) as ChecklistInstanceSummary;
      onUploaded(updated);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) onConflict();
      else onError(err instanceof ApiClientError ? err.message : t('checklists.photoUploadError', 'Unable to attach this photo.'));
    } finally {
      setProgress(null);
      onUploadingChange(false);
    }
  }

  const canAct = editable && !busy && progress === null;
  const hintId = useId();

  async function removePhoto() {
    onUploadingChange(true);
    try {
      onUploaded(await removeChecklistItemPhoto(instanceId, item.id));
    } catch (err) {
      onError(err instanceof ApiClientError ? err.message : t('checklists.photoRemoveError', 'Unable to remove this photo.'));
    } finally {
      onUploadingChange(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <input ref={inputRef} type="file" accept={CHECKLIST_PHOTO_ACCEPT} {...(cameraOnly ? { capture: 'environment' as const } : {})} onChange={(e) => void handleChange(e)} disabled={!canAct} style={{ display: 'none' }} />
      {attached && progress === null ? (
        <ChecklistPhotoProof
          instanceId={instanceId}
          itemId={item.id}
          fileName={result?.photoFileName ?? ''}
          canChange={canAct}
          onReplace={() => inputRef.current?.click()}
          onRemove={() => void removePhoto()}
          t={t}
        />
      ) : (
        <Button type="button" size="sm" variant="secondary" disabled={!canAct} aria-describedby={hintId} onClick={() => inputRef.current?.click()} style={{ minHeight: 44 }}>
          {progress !== null
            ? t('checklistSessions.conduct.photoUploading', 'Uploading... {{progress}}%', { progress })
            : t('checklists.photoAttach', 'Attach photo')}
        </Button>
      )}
      <p id={hintId} style={{ fontSize: 12, color: COLORS.muted, margin: '6px 0 0' }}>{checklistPhotoHint(cameraOnly, t)}</p>
    </div>
  );
}

function StructuredFeedback({
  appearance,
  session,
  busy,
  draft,
  onDraftChange,
  onBusyChange,
  onSaved,
  onConflict,
  t,
}: {
  appearance?: Appearance | null;
  session: ChecklistSessionSummary;
  busy: boolean;
  draft: FeedbackDraft;
  onDraftChange: (draft: FeedbackDraft) => void;
  onBusyChange: (busy: boolean) => void;
  // The feedback endpoint returns the bare ChecklistSession row (no joined checklist/learner/
  // observer/result) -- merging those projected fields back in is the caller's job.
  onSaved: (session: ChecklistSession) => void;
  onConflict: () => void;
  t: TFunction;
}) {
  const { strengths, developmentAreas, nextSteps } = draft;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { onBusyChange(saving); }, [saving, onBusyChange]);

  const custom = isCustomFeedback(session.feedback?.layout);
  const dirty = custom ? JSON.stringify(draft.answers ?? {}) !== JSON.stringify(readFeedbackAnswers(session)) : strengths !== (session.strengths ?? '') || developmentAreas !== (session.developmentAreas ?? '') || nextSteps !== (session.nextSteps ?? '');
  const automaticAttempt = useRef('');
  const saveRef = useRef<() => Promise<void>>(() => Promise.resolve());
  useEffect(() => {
    const signature = JSON.stringify([session.version, draft.answers]);
    if (!custom || !dirty || busy || saving || signature === automaticAttempt.current) return;
    const timer = window.setTimeout(() => { automaticAttempt.current = signature; void saveRef.current(); }, 800);
    return () => clearTimeout(timer);
  }, [custom, dirty, busy, saving, session.version, draft.answers]);

  async function save() {
    await runMutation(
      async () => {
        const updated = await submitChecklistSessionFeedback(session.id, custom ? { answers: draft.answers ?? {}, version: session.version } : { strengths, developmentAreas, nextSteps, version: session.version });
        onSaved(updated);
      },
      { setBusy: setSaving, setError: (message) => setError(localizeChecklistScaleError(message, t)), onConflict, fallbackMessage: t('checklistSessions.conduct.saveError', 'Unable to save.') },
    );
  }

  saveRef.current = save;

  return (
    <AppearanceBlock appearance={appearance} kind="feedback" style={{ marginTop: 20 }}>
    <div style={isEmptyBlockStyle(resolveBlockStyle(appearance, 'feedback')) ? { marginTop: 20 } : undefined}>
      <h3 style={{ fontSize: 14, color: COLORS.text, margin: '0 0 10px' }}><RichText value={session.feedback?.layout.title || t('checklistSessions.conduct.feedbackTitle', 'Structured feedback')} /></h3>
      {error && (
        <p role="alert" style={{ color: 'var(--color-danger)', fontSize: 12.5 }}>
          {error}
        </p>
      )}
      <div style={{ display: 'grid', gap: 10 }}>
        <FeedbackFields config={session.feedback} draft={draft} disabled={busy || saving} onDraftChange={onDraftChange} t={t} />
        <Button type="button" size="sm" disabled={busy || saving || !dirty} onClick={() => void save()} style={{ minHeight: 44 }}>
          {t('checklistSessions.conduct.saveFeedback', 'Save feedback')}
        </Button>
      </div>
    </div>
    </AppearanceBlock>
  );
}
