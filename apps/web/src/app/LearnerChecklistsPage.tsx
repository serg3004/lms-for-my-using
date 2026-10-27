import { ObserverSessionsBlock } from './ObserverSessionsBlock.js';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '../shared/apiClient.js';
import { CHECKLIST_PHOTO_ACCEPT, checklistPhotoErrorMessage, checklistPhotoHint, validateChecklistPhoto } from '../shared/checklistPhoto.js';
import { getChecklistItemPhotoUrl, listFreeChecklists, listMyChecklistInstances, startFreeChecklist, submitChecklistItemResult, uploadChecklistItemPhoto } from '../shared/api/checklists.js';
import type { ChecklistInstanceSummary, ChecklistItemResultSummary, ChecklistItemSummary, FreeChecklistSummary } from '../shared/api/types.js';
import { PinnedChecklistTiles } from './PinnedChecklistTiles.js';
import { PageState } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import {
  checklistResultToAnswer,
  getRequiredChecklistProgress,
  isChecklistAnswerComplete,
} from './checklistCompletion.js';
import { ChecklistDeadlineMeta } from './ChecklistDeadlineMeta.js';
import { LearnerChecklistSessions } from './LearnerChecklistSessions.js';
export function findResultForItem(results: ChecklistItemResultSummary[], itemId: string) {
  return results.find((result) => result.itemId === itemId);
}

const COLORS = {
  surface: '#ffffff',
  soft: '#f8fafc',
  text: '#172033',
  muted: '#6b7280',
  border: '#e3e8ef',
  primary: '#4f46e5',
  success: '#0f9f6e',
  successSoft: '#e9f8f2',
  // #d97706 (the design system's --color-warning token) only reaches a 2.99:1 contrast ratio
  // against warningSoft/white as *text* -- WCAG AA needs 4.5:1 for normal-size text. This darker
  // shade (~6.7:1 on warningSoft, ~4.9:1 on white) is used for warning-toned text specifically on
  // this page; warningSoft (the background) is unaffected.
  warning: '#92400e',
  warningSoft: '#fff7e8',
  primarySoft: '#eef2ff',
};

// `free` is null when the catalog could not be loaded: the rest of the page must keep working.
type LearnerChecklistsData = { instances: ChecklistInstanceSummary[]; free: FreeChecklistSummary[] | null };
export function LearnerChecklistsPage({ linkedSessionId, onLinkedSessionBack }: { linkedSessionId?: string | null; onLinkedSessionBack?: () => void } = {}) {
  const { t } = useTranslation();
  const [openInstanceId, setOpenInstanceId] = useState<string | null>(null);

  const { state: loadState, reload: load } = useAsyncData<LearnerChecklistsData>(
    async () => {
      const [instances, free] = await Promise.all([listMyChecklistInstances(), listFreeChecklists().catch(() => null)]);
      return { instances, free };
    },
    [t],
    {
      unauthenticated: t('checklists.sessionExpired', 'Your session has expired. Please sign in again.'),
      error: t('checklists.loadError', 'Unable to load your checklists.'),
    },
  );
  const [startingId, setStartingId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  if (loadState.status === 'loading') {
    return <main style={{ padding: 32 }}><PageState message={t('checklists.loading', 'Loading checklists...')} variant="loading" /></main>;
  }

  if (loadState.status === 'unauthenticated' || loadState.status === 'notFound' || loadState.status === 'error') {
    return <main style={{ padding: 32 }}><PageState title={t('checklists.title', 'Checklists')} message={loadState.message} variant="error" /></main>;
  }
  const open = openInstanceId ? loadState.data.instances.find((i) => i.id === openInstanceId) : null;
  async function startFree(checklistId: string) {
    setStartingId(checklistId);
    setStartError(null);
    try {
      const instance = await startFreeChecklist(checklistId);
      setOpenInstanceId(instance.id);
      await load();
    } catch (err) {
      setStartError(err instanceof ApiClientError ? err.message : t('checklists.free.startError', 'Unable to start this checklist.'));
    } finally {
      setStartingId(null);
    }
  }
  const freeChecklists = loadState.data.free;
  const pinnedChecklists = (freeChecklists ?? []).filter((checklist) => checklist.pinned);
  const catalogChecklists = (freeChecklists ?? []).filter((checklist) => !checklist.pinned);
  const freeButton = (checklist: FreeChecklistSummary) => (
    <button
      type="button"
      disabled={startingId !== null}
      onClick={() => (checklist.activeInstanceId ? setOpenInstanceId(checklist.activeInstanceId) : startFree(checklist.id))}
      style={{ border: 'none', borderRadius: 10, padding: '9px 16px', minHeight: 44, minWidth: 44, background: COLORS.primary, color: '#ffffff', fontWeight: 600, cursor: startingId !== null ? 'default' : 'pointer', opacity: startingId !== null ? 0.6 : 1 }}
    >
      {checklist.activeInstanceId ? t('checklists.free.continue', 'Continue') : t('checklists.free.start', 'Start')}
    </button>
  );

  if (open) {
    return (
      <main style={{ padding: 32, maxWidth: 860, margin: '0 auto' }}>
        <ChecklistTaking
          instance={open}
          onBack={() => setOpenInstanceId(null)}
          onUpdated={load}
          t={t}
        />
      </main>
    );
  }
  return (
    <main style={{ padding: 32, maxWidth: 860, margin: '0 auto' }}>
      <h1 style={{ color: COLORS.text }}>{t('checklists.title', 'Checklists')}</h1>
      <p style={{ color: COLORS.muted }}>{t('checklists.subtitle', 'Checklists assigned to you — complete them and attach photos where required.')}</p>
      {loadState.data.instances.length === 0 && !(freeChecklists && freeChecklists.length > 0) && (
        <PageState message={t('checklists.empty', 'You have no checklists assigned yet.')} />
      )}
      {loadState.data.instances.length > 0 && (
        <>
        <h2 style={{ color: COLORS.text, fontSize: 18 }}>{t('checklists.selfTitle', 'Self-study checklists')}</h2>
        <p style={{ color: COLORS.muted }}>{t('checklists.selfHint', 'You fill these in yourself, at your own pace.')}</p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
          {loadState.data.instances.map((instance) => (
            <li
              key={instance.id}
              style={{ border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 18, background: COLORS.surface, cursor: 'pointer' }}
              onClick={() => setOpenInstanceId(instance.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <strong>{instance.checklist?.title}</strong>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 999,
                    padding: '3px 10px',
                    color: instance.status === 'completed' ? COLORS.success : COLORS.warning,
                    background: instance.status === 'completed' ? COLORS.successSoft : COLORS.warningSoft,
                  }}
                >
                  {t(`checklists.status.${instance.status}`, instance.status)}
                </span>
              </div>
              <ChecklistDeadlineMeta instance={instance} />
              {instance.status === 'completed' && (
                <p style={{ color: COLORS.muted, marginBottom: 0 }}>
                  {t('checklists.resultLine', '{{score}} / {{max}} ({{percentage}}%)', {
                    score: instance.totalScore,
                    max: instance.maxScore,
                    percentage: instance.percentage,
                  })}
                </p>
              )}
            </li>
          ))}
        </ul>
        </>
      )}
      {freeChecklists === null && (
        <p role="status" style={{ color: COLORS.muted }}>{t('checklists.free.loadError', 'Unable to load free checklists.')}</p>
      )}
      {startError && <p style={{ color: '#dc2626' }} role="alert">{startError}</p>}
      <PinnedChecklistTiles items={pinnedChecklists} title={t('checklists.free.pinnedTitle', 'Pinned checklists')} action={freeButton} />
      {catalogChecklists.length > 0 && (
        <section aria-labelledby="free-checklists-title" style={{ marginTop: 24 }}>
          <h2 id="free-checklists-title" style={{ color: COLORS.text, fontSize: 18 }}>{t('checklists.free.title', 'Free checklists')}</h2>
          <p style={{ color: COLORS.muted }}>{t('checklists.free.hint', 'Start any of these yourself, whenever you need.')}</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
            {catalogChecklists.map((checklist) => (
              <li key={checklist.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 18, background: COLORS.surface, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                  <strong>{checklist.title}</strong>
                  {checklist.description && <p style={{ color: COLORS.muted, margin: '4px 0 0' }}>{checklist.description}</p>}
                  <p style={{ color: COLORS.muted, margin: '4px 0 0', fontSize: 13 }}>{t('checklists.free.itemCount', 'Criteria: {{count}}', { count: checklist.itemCount })}</p>
                </div>
                {freeButton(checklist)}
              </li>
            ))}
          </ul>
        </section>
      )}
      <ObserverSessionsBlock />
      <LearnerChecklistSessions linkedSessionId={linkedSessionId} onLinkedSessionBack={onLinkedSessionBack} t={t} />
    </main>
  );
}
function ChecklistTaking({
  instance,
  onBack,
  onUpdated,
  t,
}: {
  instance: ChecklistInstanceSummary;
  onBack: () => void;
  onUpdated: () => Promise<void>;
  t: TFunction;
}) {
  const checklist = instance.checklist;
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!checklist) return null;
  const resultFor = (itemId: string) => findResultForItem(instance.results, itemId);
  const { completedRequired, requiredCount } = getRequiredChecklistProgress(
    checklist.items,
    instance.results,
    checklist.scoringMode,
  );
  const editable = instance.status === 'assigned' || instance.status === 'in_progress';
  async function submit(item: ChecklistItemSummary, input: { checked?: boolean; scaleLevel?: number; photoUrl?: string }) {
    setSubmitting(item.id);
    setError(null);
    try {
      await submitChecklistItemResult(instance.id, item.id, input);
      await onUpdated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('checklists.submitError', 'Unable to save this item.'));
    } finally {
      setSubmitting(null);
    }
  }
  async function uploadPhoto(item: ChecklistItemSummary, file: File) {
    setError(null);
    const invalid = validateChecklistPhoto(file);
    if (invalid) { setError(checklistPhotoErrorMessage(invalid, t)); return; }
    setSubmitting(item.id);
    try {
      await uploadChecklistItemPhoto(instance.id, item.id, file);
      await onUpdated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('checklists.photoUploadError', 'Unable to attach this photo.'));
    } finally {
      setSubmitting(null);
    }
  }
  return (
    <div>
      <button type="button" onClick={onBack} style={{ border: 'none', background: 'none', color: COLORS.primary, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 16 }}>
        ← {t('checklists.backToList', 'All checklists')}
      </button>
      <h1 style={{ color: COLORS.text, marginBottom: 4 }}>{checklist.title}</h1>
      {checklist.description && <p style={{ color: COLORS.muted }}>{checklist.description}</p>}
      <ChecklistDeadlineMeta instance={instance} />
      {instance.status === 'expired' && (
        <p style={{ color: '#b91c1c', background: '#fef2f2', borderRadius: 10, padding: '10px 12px' }} role="status">
          {t('checklists.expiredReason', 'This checklist expired at its deadline and can no longer be changed.')}
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
        <div style={{ flex: 1, height: 8, borderRadius: 999, background: COLORS.soft, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: COLORS.primary, width: `${requiredCount ? (completedRequired / requiredCount) * 100 : 0}%` }} />
        </div>
        <span style={{ fontSize: 12.5, color: COLORS.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {t('checklists.requiredProgress', '{{completed}} / {{total}} required', {
            completed: completedRequired,
            total: requiredCount,
          })}
        </span>
      </div>
      {error && <p style={{ color: '#dc2626' }} role="alert">{error}</p>}
      <div style={{ display: 'grid', gap: 12 }}>
        {checklist.items.map((item) => {
          const result = resultFor(item.id);
          const isDone = isChecklistAnswerComplete(item, checklist.scoringMode, checklistResultToAnswer(result));
          return (
            <div
              key={item.id}
              style={{
                border: `1px solid ${isDone ? COLORS.success : COLORS.border}`,
                background: isDone ? COLORS.successSoft : COLORS.surface,
                borderRadius: 14,
                padding: 16,
              }}
            >
              <p style={{ fontWeight: 600, marginTop: 0 }}>
                {item.text}{' '}
                <span style={{ color: COLORS.muted, fontSize: 12, fontWeight: 500 }}>
                  {item.isRequired
                    ? t('checklists.requiredItem', 'Required')
                    : t('checklists.optionalItem', 'Optional')}
                </span>
              </p>
              {checklist.scoringMode === 'scale' ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(checklist.scaleLevels ?? []).map((level) => (
                    <button
                      key={level.level}
                      type="button"
                      disabled={!editable || submitting === item.id}
                      onClick={() => void submit(item, { scaleLevel: level.level })}
                      style={{
                        border: `1px solid ${result?.scaleLevel === level.level ? COLORS.primary : COLORS.border}`,
                        background: result?.scaleLevel === level.level ? COLORS.primarySoft : COLORS.surface,
                        borderRadius: 10,
                        padding: '8px 12px',
                        fontSize: 12.5,
                        textAlign: 'left',
                        cursor: editable ? 'pointer' : 'default',
                        minWidth: 90,
                      }}
                    >
                      <strong style={{ display: 'block', fontSize: 14 }}>{level.points}</strong>
                      <span style={{ color: COLORS.muted }}>{level.label}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={result?.checked ?? false}
                    disabled={!editable || submitting === item.id}
                    onChange={(e) => void submit(item, { checked: e.target.checked })}
                  />
                  {t('checklists.markDone', 'Done')}
                  {checklist.scoringMode === 'sum_points' ? ` (${item.points} ${t('checklists.points', 'pts')})` : ''}
                </label>
              )}
              {item.photoRequired && (
                <PhotoAttachment
                  instanceId={instance.id}
                  item={item}
                  result={result}
                  cameraOnly={checklist.forbidGalleryPhotos === true}
                  editable={editable}
                  busy={submitting === item.id}
                  onSelectFile={(file) => void uploadPhoto(item, file)}
                  t={t}
                />
              )}
            </div>
          );
        })}
      </div>
      {instance.status === 'completed' && (
        <div
          style={{
            marginTop: 20,
            borderRadius: 14,
            padding: '16px 18px',
            background: instance.passed ? COLORS.successSoft : COLORS.warningSoft,
            color: instance.passed ? '#166534' : COLORS.warning,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{instance.passed ? t('checklists.passed', 'Passed') : t('checklists.notPassed', 'Not passed')}</span>
          <strong>{instance.totalScore} / {instance.maxScore} ({instance.percentage}%)</strong>
        </div>
      )}
      {instance.status === 'submitted' && (
        <p style={{ color: COLORS.warning, marginTop: 16 }}>{t('checklists.awaitingReview', 'Submitted — waiting for your instructor to confirm the result.')}</p>
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
  onSelectFile,
  t,
}: {
  instanceId: string;
  item: ChecklistItemSummary;
  result: ChecklistItemResultSummary | undefined;
  cameraOnly: boolean;
  editable: boolean;
  busy: boolean;
  onSelectFile: (file: File) => void;
  t: TFunction;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const attached = Boolean(result?.photoFileName);
  useEffect(() => {
    if (!attached) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    getChecklistItemPhotoUrl(instanceId, item.id)
      .then((response) => {
        if (!cancelled) setPreviewUrl(response.url);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [attached, instanceId, item.id, result?.photoFileName]);
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onSelectFile(file);
  }
  const canAct = editable && !busy && !!result;
  return (
    <div style={{ marginTop: 10 }}>
      <input
        ref={inputRef}
        type="file"
        accept={CHECKLIST_PHOTO_ACCEPT}
        {...(cameraOnly ? { capture: 'environment' as const } : {})}
        onChange={handleChange}
        disabled={!canAct}
        style={{ display: 'none' }}
      />
      {attached ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={result?.photoFileName ?? ''}
              style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', border: `1px solid ${COLORS.border}`, flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: 10, background: COLORS.successSoft, color: COLORS.success, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</div>
          )}
          <div style={{ fontSize: 11.5, color: COLORS.muted }}>
            <strong style={{ display: 'block', color: COLORS.success, fontSize: 12 }}>{t('checklists.photoAttached', 'Photo attached')}</strong>
            {result?.photoFileName}
          </div>
          <button
            type="button"
            disabled={!canAct}
            onClick={() => inputRef.current?.click()}
            style={{ marginLeft: 'auto', border: 'none', background: 'none', color: COLORS.primary, fontSize: 11.5, cursor: canAct ? 'pointer' : 'default', padding: 0 }}
          >
            {t('checklists.photoReplace', 'Replace')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            disabled={!canAct}
            onClick={() => inputRef.current?.click()}
            aria-label={t('checklists.photoAttach', 'Attach photo')}
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              border: `1.5px dashed ${COLORS.border}`,
              background: COLORS.primarySoft,
              color: COLORS.primary,
              fontSize: 19,
              lineHeight: 1,
              cursor: canAct ? 'pointer' : 'default',
              flexShrink: 0,
            }}
          >
            +
          </button>
          <span style={{ fontSize: 12, color: COLORS.muted }}>
            {result
              ? t('checklists.photoHint', 'Photo required — tap to attach')
              : t('checklists.photoHintUnanswered', 'Mark this item first, then attach a photo')}
            {result && <span style={{ display: 'block', fontSize: 11.5 }}>{checklistPhotoHint(cameraOnly, t)}</span>}
          </span>
        </div>
      )}
    </div>
  );
}
