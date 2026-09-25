import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { TFunction } from 'i18next';
import { ApiClientError } from '../shared/apiClient.js';
import { uploadChecklistItemPhotoWithProgress } from '../shared/apiClient.js';
import { getChecklistInstance, skipChecklistItem, submitChecklistItemResult } from '../shared/api/checklists.js';
import {
  captureChecklistSessionLocation,
  getChecklistSession,
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
import { Avatar, Badge, Button, InlineFeedback, PageState, ProgressBar, Textarea } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { checklistResultToAnswer, getRequiredChecklistProgress, isChecklistAnswerComplete } from './checklistCompletion.js';

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
 * PR 297: mobile-first "Observer conducts a session" screen, reached from
 * InstructorChecklistReviewsPage's "Проведение" tab (ChecklistSessionsToConduct). A session and
 * its underlying ChecklistInstance are separate id spaces (docs/architecture/adr/
 * ADR_CHECKLIST_SESSION_OVERLAY.md) -- item results/skip/photo all go through the instance, the
 * lifecycle (start/pause/resume/complete) and structured feedback through the session.
 */
export async function fetchConductData(sessionId: string): Promise<ConductData> {
  const session = await getChecklistSession(sessionId);
  const instance = await getChecklistInstance(session.instanceId);
  return { session, instance };
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [geoNotice, setGeoNotice] = useState<GeoNotice>(null);

  if (!checklist) return null;

  const items = checklist.items;
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
  const canComplete = session.status === 'in_progress' && completedRequired === requiredCount;

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
        style={{ border: 'none', background: 'none', color: COLORS.primary, fontWeight: 600, cursor: 'pointer', padding: '8px 0', minHeight: 44 }}
      >
        ← {t('checklistSessions.conduct.backToList', 'My sessions')}
      </button>

      <Header session={session} instance={instance} t={t} />

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

      {(session.status === 'in_progress' || session.status === 'paused') && (
        <>
          <div style={{ margin: '16px 0' }}>
            <ProgressBar
              value={completedRequired}
              max={requiredCount || 1}
              label={t('checklistSessions.conduct.progress', '{{completed}} / {{total}} required', { completed: completedRequired, total: requiredCount })}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {session.status === 'in_progress' ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void transition('pause')} style={{ flex: 1, minHeight: 44 }}>
                {t('checklistSessions.conduct.pause', 'Pause')}
              </Button>
            ) : (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void transition('resume')} style={{ flex: 1, minHeight: 44 }}>
                {t('checklistSessions.conduct.resume', 'Resume')}
              </Button>
            )}
            <Button type="button" disabled={busy || !canComplete} onClick={() => void transition('complete')} style={{ flex: 1, minHeight: 44 }}>
              {t('checklistSessions.conduct.complete', 'Complete')}
            </Button>
          </div>
          {!canComplete && (
            <p style={{ color: COLORS.muted, fontSize: 12.5, marginTop: -8, marginBottom: 16 }}>
              {t('checklistSessions.conduct.incompleteHint', 'All required criteria must be answered before completing.')}
            </p>
          )}

          {items.length > 0 && (
            <CriterionStepper
              items={items}
              stepIndex={stepIndex}
              setStepIndex={setStepIndex}
              instance={instance}
              editable={editable}
              onInstanceSaved={(updatedInstance) => onMutate((current) => ({ ...current, instance: updatedInstance }))}
              onConflict={() => setConflict(true)}
              t={t}
            />
          )}
        </>
      )}

      {(session.status === 'in_progress' || session.status === 'paused' || session.status === 'completed') && (
        <StructuredFeedback
          session={session}
          busy={busy}
          onSaved={(updatedSession) => onMutate((current) => ({ ...current, session: { ...current.session, ...updatedSession } }))}
          onConflict={() => setConflict(true)}
          t={t}
        />
      )}

      {session.status === 'completed' && (
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
          <span>{instance.passed ? t('checklists.passed', 'Passed') : t('checklists.notPassed', 'Not passed')}</span>
          <strong>
            {instance.totalScore} / {instance.maxScore} ({instance.percentage}%)
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
        <p style={{ margin: 0, color: COLORS.muted, fontSize: 13 }}>{instance.checklist?.title ?? session.checklist.title}</p>
      </div>
      <div style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
        <Badge variant={CHECKLIST_SESSION_STATUS_BADGE_VARIANT[session.status]}>
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

function CriterionStepper({
  items,
  stepIndex,
  setStepIndex,
  instance,
  editable,
  onInstanceSaved,
  onConflict,
  t,
}: {
  items: ChecklistItemSummary[];
  stepIndex: number;
  setStepIndex: (index: number) => void;
  instance: ChecklistInstanceSummary;
  editable: boolean;
  onInstanceSaved: (instance: ChecklistInstanceSummary) => void;
  onConflict: () => void;
  t: TFunction;
}) {
  const checklist = instance.checklist;
  // Each response carries a whole instance snapshot, and onInstanceSaved replaces `current.instance`
  // with it wholesale -- navigating to another criterion while this one's save/upload is still in
  // flight would let that request's response resolve after the next criterion's and overwrite it
  // with stale data. Blocking Back/Next while the visible card reports a pending mutation keeps
  // these requests serialized instead of merging out of order.
  const [cardBusy, setCardBusy] = useState(false);
  if (!checklist) return null;
  const boundedIndex = Math.min(stepIndex, items.length - 1);
  const item = items[boundedIndex];
  const result = instance.results.find((r) => r.itemId === item.id);
  const isDone = isChecklistAnswerComplete(item, checklist.scoringMode, checklistResultToAnswer(result));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: COLORS.muted, fontWeight: 600 }}>
          {t('checklistSessions.conduct.criterionOf', 'Criterion {{index}} / {{total}}', { index: boundedIndex + 1, total: items.length })}
        </span>
      </div>

      <div
        style={{
          border: `1px solid ${isDone ? COLORS.success : COLORS.border}`,
          background: isDone ? COLORS.successSoft : COLORS.surface,
          borderRadius: 14,
          padding: 16,
        }}
      >
        <CriterionCard
          key={item.id}
          instanceId={instance.id}
          item={item}
          result={result}
          scoringMode={checklist.scoringMode}
          scaleLevels={checklist.scaleLevels}
          editable={editable}
          onSaved={onInstanceSaved}
          onBusyChange={setCardBusy}
          onConflict={onConflict}
          t={t}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button
          type="button"
          variant="secondary"
          disabled={boundedIndex === 0 || cardBusy}
          onClick={() => setStepIndex(boundedIndex - 1)}
          style={{ flex: 1, minHeight: 44 }}
        >
          {t('checklistSessions.conduct.back', 'Back')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={boundedIndex === items.length - 1 || cardBusy}
          onClick={() => setStepIndex(boundedIndex + 1)}
          style={{ flex: 1, minHeight: 44 }}
        >
          {t('checklistSessions.conduct.next', 'Next')}
        </Button>
      </div>
    </div>
  );
}

function CriterionCard({
  instanceId,
  item,
  result,
  scoringMode,
  scaleLevels,
  editable,
  onSaved,
  onBusyChange,
  onConflict,
  t,
}: {
  instanceId: string;
  item: ChecklistItemSummary;
  result: ChecklistItemResultSummary | undefined;
  scoringMode: string;
  scaleLevels: { level: number; label: string; points: number }[] | null;
  editable: boolean;
  onSaved: (instance: ChecklistInstanceSummary) => void;
  onBusyChange: (busy: boolean) => void;
  onConflict: () => void;
  t: TFunction;
}) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState(result?.comment ?? '');
  // Combines this card's own save state with the photo upload's (tracked separately below, since
  // it doesn't go through run()) so the parent stepper can block navigation during either -- see
  // CriterionStepper's cardBusy comment for why that matters.
  const busy = saving || uploading;

  useEffect(() => {
    setComment(result?.comment ?? '');
  }, [result?.comment, item.id]);

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  async function run(fn: () => Promise<ChecklistInstanceSummary>) {
    await runMutation(
      async () => {
        const updated = await fn();
        onSaved(updated);
      },
      { setBusy: setSaving, setError, onConflict, fallbackMessage: t('checklistSessions.conduct.saveError', 'Unable to save.') },
    );
  }

  const canAct = editable && !busy;

  return (
    <div>
      <p style={{ fontWeight: 600, margin: '0 0 6px' }}>{item.text}</p>
      <p style={{ color: COLORS.muted, fontSize: 12, margin: '0 0 10px' }}>
        {item.isRequired ? t('checklists.requiredItem', 'Required') : t('checklists.optionalItem', 'Optional')}
      </p>

      {error && (
        <p role="alert" style={{ color: 'var(--color-danger)', fontSize: 12.5 }}>
          {error}
        </p>
      )}

      {item.scale ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {item.scale.levels.map((level) => (
            <button
              key={level.value}
              type="button"
              disabled={!canAct}
              onClick={() => void run(() => submitChecklistItemResult(instanceId, item.id, { scaleLevel: level.value }))}
              style={{
                border: `1px solid ${result?.scaleLevel === level.value ? COLORS.primary : COLORS.border}`,
                background: result?.scaleLevel === level.value ? 'var(--color-primary-bg, #eef2ff)' : COLORS.surface,
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 13,
                minHeight: 44,
                cursor: canAct ? 'pointer' : 'default',
              }}
            >
              {level.label} ({level.score})
            </button>
          ))}
        </div>
      ) : scoringMode === 'scale' ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(scaleLevels ?? []).map((level) => (
            <button
              key={level.level}
              type="button"
              disabled={!canAct}
              onClick={() => void run(() => submitChecklistItemResult(instanceId, item.id, { scaleLevel: level.level }))}
              style={{
                border: `1px solid ${result?.scaleLevel === level.level ? COLORS.primary : COLORS.border}`,
                background: result?.scaleLevel === level.level ? 'var(--color-primary-bg, #eef2ff)' : COLORS.surface,
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 13,
                minHeight: 44,
                cursor: canAct ? 'pointer' : 'default',
              }}
            >
              {level.label}
            </button>
          ))}
        </div>
      ) : (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, minHeight: 44 }}>
          <input
            type="checkbox"
            checked={result?.checked ?? false}
            disabled={!canAct}
            onChange={(e) => void run(() => submitChecklistItemResult(instanceId, item.id, { checked: e.target.checked }))}
          />
          {t('checklists.markDone', 'Done')}
        </label>
      )}

      <div style={{ marginTop: 12 }}>
        <Textarea
          label={t('checklistSessions.conduct.comment', 'Comment')}
          value={comment}
          disabled={!editable}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canAct || comment === (result?.comment ?? '')}
          onClick={() => void run(() => submitChecklistItemResult(instanceId, item.id, { comment }))}
          style={{ marginTop: 6, minHeight: 44 }}
        >
          {t('checklistSessions.conduct.saveComment', 'Save comment')}
        </Button>
      </div>

      {item.photoRequired && (
        <PhotoAttachment
          instanceId={instanceId}
          item={item}
          result={result}
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

  // Deliberately never renders an `<img>` thumbnail (neither the already-uploaded photo fetched
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

  return (
    <div style={{ marginTop: 12 }}>
      <input ref={inputRef} type="file" accept="image/*" onChange={(e) => void handleChange(e)} disabled={!canAct} style={{ display: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 44, height: 44, borderRadius: 10, background: COLORS.soft, color: COLORS.muted,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          {attached ? '✓' : '+'}
        </div>
        <Button type="button" size="sm" variant="secondary" disabled={!canAct} onClick={() => inputRef.current?.click()} style={{ minHeight: 44 }}>
          {progress !== null
            ? t('checklistSessions.conduct.photoUploading', 'Uploading... {{progress}}%', { progress })
            : attached
              ? t('checklists.photoReplace', 'Replace')
              : t('checklists.photoAttach', 'Attach photo')}
        </Button>
      </div>
    </div>
  );
}

function StructuredFeedback({
  session,
  busy,
  onSaved,
  onConflict,
  t,
}: {
  session: ChecklistSessionSummary;
  busy: boolean;
  // The feedback endpoint returns the bare ChecklistSession row (no joined checklist/learner/
  // observer/result) -- merging those projected fields back in is the caller's job.
  onSaved: (session: ChecklistSession) => void;
  onConflict: () => void;
  t: TFunction;
}) {
  const [strengths, setStrengths] = useState(session.strengths ?? '');
  const [developmentAreas, setDevelopmentAreas] = useState(session.developmentAreas ?? '');
  const [nextSteps, setNextSteps] = useState(session.nextSteps ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStrengths(session.strengths ?? '');
    setDevelopmentAreas(session.developmentAreas ?? '');
    setNextSteps(session.nextSteps ?? '');
  }, [session.strengths, session.developmentAreas, session.nextSteps]);

  const dirty = strengths !== (session.strengths ?? '') || developmentAreas !== (session.developmentAreas ?? '') || nextSteps !== (session.nextSteps ?? '');

  async function save() {
    await runMutation(
      async () => {
        const updated = await submitChecklistSessionFeedback(session.id, { strengths, developmentAreas, nextSteps, version: session.version });
        onSaved(updated);
      },
      { setBusy: setSaving, setError, onConflict, fallbackMessage: t('checklistSessions.conduct.saveError', 'Unable to save.') },
    );
  }

  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ fontSize: 14, color: COLORS.text, margin: '0 0 10px' }}>{t('checklistSessions.conduct.feedbackTitle', 'Structured feedback')}</h3>
      {error && (
        <p role="alert" style={{ color: 'var(--color-danger)', fontSize: 12.5 }}>
          {error}
        </p>
      )}
      <div style={{ display: 'grid', gap: 10 }}>
        <Textarea
          label={t('checklistSessions.conduct.strengths', 'Strengths')}
          value={strengths}
          disabled={busy || saving}
          onChange={(e) => setStrengths(e.target.value)}
          rows={2}
        />
        <Textarea
          label={t('checklistSessions.conduct.developmentAreas', 'Development areas')}
          value={developmentAreas}
          disabled={busy || saving}
          onChange={(e) => setDevelopmentAreas(e.target.value)}
          rows={2}
        />
        <Textarea
          label={t('checklistSessions.conduct.nextSteps', 'Next steps')}
          value={nextSteps}
          disabled={busy || saving}
          onChange={(e) => setNextSteps(e.target.value)}
          rows={2}
        />
        <Button type="button" size="sm" disabled={busy || saving || !dirty} onClick={() => void save()} style={{ minHeight: 44 }}>
          {t('checklistSessions.conduct.saveFeedback', 'Save feedback')}
        </Button>
      </div>
    </div>
  );
}
