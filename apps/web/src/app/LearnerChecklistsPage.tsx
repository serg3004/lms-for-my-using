import { RichText, plainText } from '../shared/RichText.js';
import { checklistResultText } from '../shared/checklistResultText.js';
import { AppearanceBlock, itemCardStyle } from '../shared/AppearanceBlock.js';
import { checklistLabel, checklistNumbers } from '@lms/shared/checklist-numbering';
import { RichDescription } from '../shared/RichDescription.js';
import { CriterionOptions, yesNoOptions } from '../shared/CriterionOptions.js';
import { ObserverSessionsBlock } from './ObserverSessionsBlock.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '../shared/apiClient.js';
import { CHECKLIST_PHOTO_ACCEPT, checklistPhotoErrorMessage, checklistPhotoHint, validateChecklistPhoto } from '../shared/checklistPhoto.js';
import { finishChecklistInstance, getChecklistVoiceNoteBlob, getChecklistVoiceSettings, listChecklistVoiceNotes, listChecklistsTransferredFromMe, removeChecklistVoiceNote, uploadChecklistVoiceNote, listFreeChecklists, listMyChecklistInstances, removeChecklistItemPhoto, startFreeChecklist, submitChecklistItemResult, uploadChecklistItemPhoto } from '../shared/api/checklists.js';
import type { ChecklistVoiceNote } from '../shared/api/checklists.js';
import { ChecklistVoiceNotes } from './ChecklistVoiceNotes.js';
import { useVoiceSettings, type ChecklistVoiceApi } from './checklistVoice.js';
import type { ChecklistInstanceSummary, ChecklistItemResultSummary, ChecklistItemSummary, ChecklistTransferredAway, FreeChecklistSummary } from '../shared/api/types.js';
import { ChecklistCover } from '../shared/ChecklistCover.js';
import { ChecklistPhotoStrip } from '../shared/ChecklistPhotoStrip.js';
import { ChecklistAccessBadge } from '../shared/checklistAccess.js';
import { PinnedChecklistTiles } from './PinnedChecklistTiles.js';
import { Button, PageState } from '../shared/ui.js';
import { ChecklistItemDescription, ChecklistNoteField } from './ChecklistItemNote.js';
import { isNoteOffered, isNoteRequired, pendingAnswer } from './checklistItemNote.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { ChecklistPhotoProof } from './ChecklistPhotoProof.js';
import { ChecklistFinishBar } from './ChecklistFinishBar.js';
import { ChecklistInstancePreview } from './ChecklistInstancePreview.js';
import { ChecklistTransferButton, ChecklistTransferHistory } from './ChecklistTransfer.js';
import {
  checklistResultToAnswer,
  checklistItemLevels,
  localizeChecklistScaleError,
  getRequiredChecklistProgress,
  isChecklistAnswerComplete,
  isChecklistRequirementSatisfied,
} from './checklistCompletion.js';
import { ChecklistDeadlineMeta } from './ChecklistDeadlineMeta.js';
import { LearnerChecklistFilters, learnerRowTab, matchesSearch, tabFromHash } from './LearnerChecklistFilters.js';
import type { LearnerListTab } from './LearnerChecklistFilters.js';
import { LearnerChecklistSessions } from './LearnerChecklistSessions.js';
export function findResultForItem(results: ChecklistItemResultSummary[], itemId: string) {
  return results.find((result) => result.itemId === itemId);
}

const COLORS = {
  surface: 'var(--color-surface)',
  soft: 'var(--color-surface-muted)',
  text: 'var(--color-text)',
  muted: 'var(--color-text-muted)',
  border: 'var(--color-border)',
  primary: 'var(--color-primary)',
  success: 'var(--color-success)',
  successSoft: 'var(--color-success-bg)',
  // #d97706 (the design system's --color-warning token) only reaches a 2.99:1 contrast ratio
  // against warningSoft/white as *text* -- WCAG AA needs 4.5:1 for normal-size text. This darker
  // shade (~6.7:1 on warningSoft, ~4.9:1 on white) is used for warning-toned text specifically on
  // this page; warningSoft (the background) is unaffected.
  warning: '#92400e',
  warningSoft: 'var(--color-warning-bg)',
  primarySoft: 'var(--color-accent-soft)',
};

type LearnerChecklistRow = {
  key: string;
  checklistId: string;
  title: string;
  description: string | null;
  coverUpdatedAt: string | null;
  access: { accessMode?: 'assigned' | 'free'; pinned?: boolean };
  instance?: ChecklistInstanceSummary;
  free?: FreeChecklistSummary;
};

// `free` is null when the catalog could not be loaded: the rest of the page must keep working.
type LearnerChecklistsData = { instances: ChecklistInstanceSummary[]; free: FreeChecklistSummary[] | null; transferred?: ChecklistTransferredAway[] };
export function LearnerChecklistsPage({ linkedSessionId, onLinkedSessionBack, openInstanceId: initialOpenInstanceId }: { linkedSessionId?: string | null; onLinkedSessionBack?: () => void; openInstanceId?: string | null } = {}) {
  const { t } = useTranslation();
  const [openInstanceId, setOpenInstanceId] = useState<string | null>(initialOpenInstanceId ?? null);

  const { state: loadState, refresh } = useAsyncData<LearnerChecklistsData>(
    async () => {
      // PR 477: the "Handed over" list is a convenience; the page works without it.
      const [instances, free, transferred] = await Promise.all([listMyChecklistInstances(), listFreeChecklists().catch(() => null), listChecklistsTransferredFromMe().catch(() => [])]);
      return { instances, free, transferred };
    },
    [t],
    {
      unauthenticated: t('checklists.sessionExpired', 'Your session has expired. Please sign in again.'),
      error: t('checklists.loadError', 'Unable to load your checklists.'),
    },
  );
  const [startingId, setStartingId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [listTab, setListTab] = useState<LearnerListTab>(() => (typeof window === 'undefined' ? 'assigned' : tabFromHash(window.location.hash)));
  const [query, setQuery] = useState('');
  // PR 478: the filled-in sheet shown as a report.
  const [previewInstanceId, setPreviewInstanceId] = useState<string | null>(null);
  useEffect(() => {
    const onHash = () => setListTab(tabFromHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  function chooseTab(next: LearnerListTab) {
    setListTab(next);
    try { window.history.replaceState(null, '', next === 'completed' ? '#completed' : window.location.pathname + window.location.search); } catch { /* the address is a convenience */ }
  }
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
      await refresh();
      setOpenInstanceId(instance.id);
    } catch (err) {
      setStartError(err instanceof ApiClientError ? err.message : t('checklists.free.startError', 'Unable to start this checklist.'));
    } finally {
      setStartingId(null);
    }
  }
  const freeChecklists = loadState.data.free;
  const transferred = Array.isArray(loadState.data.transferred) ? loadState.data.transferred : [];
  // The access label follows the live catalog (the instance snapshot may predate a mode change); the
  // frozen snapshot is only the fallback when the catalog could not be loaded.
  const freeById = new Map((freeChecklists ?? []).map((checklist) => [checklist.id, checklist]));
  const accessOf = (instance: ChecklistInstanceSummary) => {
    const free = freeById.get(instance.checklistId);
    if (free) return { accessMode: 'free' as const, pinned: free.pinned };
    return freeChecklists ? { accessMode: 'assigned' as const } : { accessMode: instance.checklist?.accessMode, pinned: instance.checklist?.pinned };
  };
  const pinnedChecklists = (freeChecklists ?? []).filter((checklist) => checklist.pinned);
  // One list: every instance of the learner (assigned or free) plus the free checklists not started yet.
  // A free checklist with an unfinished instance is shown through that instance, never twice; once it is finished it offers "Start" again.
  const instanceIds = new Set(loadState.data.instances.map((instance) => instance.id));
  const rows: LearnerChecklistRow[] = [
    ...loadState.data.instances.map((instance): LearnerChecklistRow => {
      const free = freeById.get(instance.checklistId);
      return {
        key: `instance-${instance.id}`,
        checklistId: instance.checklistId,
        title: instance.checklist?.title ?? '',
        description: instance.checklist?.description ?? null,
        coverUpdatedAt: free?.coverUpdatedAt ?? instance.checklist?.coverUpdatedAt ?? null,
        access: accessOf(instance),
        instance,
        free,
      };
    }),
    ...(freeChecklists ?? []).filter((checklist) => !checklist.activeInstanceId || !instanceIds.has(checklist.activeInstanceId)).map((checklist): LearnerChecklistRow => ({
      key: `free-${checklist.id}`,
      checklistId: checklist.id,
      title: checklist.title,
      description: checklist.description ?? null,
      coverUpdatedAt: checklist.coverUpdatedAt ?? null,
      access: { accessMode: 'free', pinned: checklist.pinned },
      free: checklist,
    })),
  ];
  const shownRows = rows.filter((row) => learnerRowTab(row) === listTab && matchesSearch(row.title, query));
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

  if (open && previewInstanceId === open.id) {
    return (
      <main style={{ padding: 32, maxWidth: 860, margin: '0 auto' }}>
        <ChecklistInstancePreview instanceId={open.id} onBack={() => setPreviewInstanceId(null)} t={t} />
      </main>
    );
  }
  if (open) {
    return (
      <main style={{ padding: 32, maxWidth: 860, margin: '0 auto' }}>
        <ChecklistTaking
          instance={open}
          onBack={() => setOpenInstanceId(null)}
          onUpdated={refresh}
          onTransferred={() => { setOpenInstanceId(null); void refresh(); }}
          onPreview={() => setPreviewInstanceId(open.id)}
          t={t}
        />
      </main>
    );
  }
  return (
    <main style={{ padding: 32, maxWidth: 860, margin: '0 auto' }}>
      <h1 style={{ color: COLORS.text }}>{t('checklists.title', 'Checklists')}</h1>
      <p style={{ color: COLORS.muted }}>{t('checklists.subtitle', 'Checklists assigned to you — complete them and attach photos where required.')}</p>
      {rows.length === 0 && <PageState message={t('checklists.empty', 'There are no checklists available to you yet.')} />}
      {freeChecklists === null && (
        <p role="status" style={{ color: COLORS.muted }}>{t('checklists.free.loadError', 'Unable to load free checklists.')}</p>
      )}
      {startError && <p style={{ color: 'var(--color-danger)' }} role="alert">{startError}</p>}
      <PinnedChecklistTiles items={pinnedChecklists} title={t('checklists.free.pinnedTitle', 'Pinned checklists')} action={freeButton} />
      {rows.length > 0 && (
        <section aria-labelledby="all-checklists-title" style={{ marginTop: 24 }}>
          <h2 id="all-checklists-title" className="ui-visually-hidden">{t('checklists.all.title', 'All my checklists')}</h2>
          <LearnerChecklistFilters
            tab={listTab}
            counts={{ assigned: rows.filter((row) => learnerRowTab(row) === 'assigned').length, completed: rows.filter((row) => learnerRowTab(row) === 'completed').length }}
            query={query}
            onTab={chooseTab}
            onQuery={setQuery}
            t={t}
          />
          {shownRows.length === 0 && (
            <p role="status" style={{ color: COLORS.muted }}>
              {query.trim() ? t('checklists.all.notFound', 'Nothing found') : listTab === 'completed' ? t('checklists.all.emptyCompleted', 'No completed checklists yet') : t('checklists.all.emptyAssigned', 'No assigned checklists')}
            </p>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
            {shownRows.map((row) => (
              <li
                key={row.key}
                style={{ border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 14, background: COLORS.surface, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', cursor: row.instance ? 'pointer' : 'default' }}
                onClick={row.instance ? () => setOpenInstanceId(row.instance!.id) : undefined}
              >
                <div style={{ width: 112, flex: '0 0 112px' }}>
                  <ChecklistCover checklistId={row.checklistId} coverUpdatedAt={row.coverUpdatedAt} title={plainText(row.title)} ratio="16 / 9" />
                </div>
                <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ overflowWrap: 'anywhere' }}>{plainText(row.title)}</strong>
                    <ChecklistAccessBadge checklist={row.access} t={t} />
                    {row.instance && (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          borderRadius: 999,
                          padding: '3px 10px',
                          color: row.instance.status === 'completed' ? COLORS.success : COLORS.warning,
                          background: row.instance.status === 'completed' ? COLORS.successSoft : COLORS.warningSoft,
                        }}
                      >
                        {t(`checklists.status.${row.instance.status}`, row.instance.status)}
                      </span>
                    )}
                  </div>
                  {row.description && <p style={{ color: COLORS.muted, margin: '4px 0 0' }}><RichDescription value={row.description} /></p>}
                  {row.free && !row.instance && (
                    <p style={{ color: COLORS.muted, margin: '4px 0 0', fontSize: 13 }}>{t('checklists.free.itemCount', 'Criteria: {{count}}', { count: row.free.itemCount })}</p>
                  )}
                  {row.instance && <ChecklistDeadlineMeta instance={row.instance} />}
                  {row.instance?.status === 'completed' && row.instance.checklist?.scoringMode === 'none' && (
                    <p style={{ color: COLORS.muted, marginBottom: 0 }}>{t('checklists.finishedNoPointsDone', 'The check is completed')}</p>
                  )}
                  {row.instance?.status === 'completed' && row.instance.checklist?.scoringMode !== 'none' && (
                    <p style={{ color: COLORS.muted, marginBottom: 0 }}>
                      {row.instance.passed ? t('checklists.resultPassed', 'Passed') : t('checklists.resultNotPassed', 'Not passed')}{' — '}{checklistResultText(row.instance, row.instance.checklist?.showPointsToLearner === true, t)}
                    </p>
                  )}
                </div>
                {row.free && (!row.instance || row.free.activeInstanceId === row.instance.id) && freeButton(row.free)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {transferred.length > 0 && (
        <section aria-labelledby="transferred-title" style={{ marginTop: 24 }}>
          <h2 id="transferred-title" style={{ fontSize: 18 }}>{t('checklists.transfer.handedOverTitle', 'Handed over to colleagues')}</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {transferred.map((row) => (
              <li key={row.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 14, background: COLORS.soft, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong style={{ overflowWrap: 'anywhere' }}>{plainText(row.title)}</strong>
                <span style={{ fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '3px 10px', color: COLORS.warning, background: COLORS.warningSoft }}>{t('checklists.transfer.handedOver', 'Handed over')}</span>
                {row.toUser && <span style={{ color: COLORS.muted }}>{t('checklists.transfer.handedOverTo', 'Handed over: {{name}}', { name: `${row.toUser.lastName} ${row.toUser.firstName}`.trim() })}</span>}
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
/** A copy of `record` without `key`. */
function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([entry]) => entry !== key));
}
/**
 * The operations the taking screen needs. The employee's own pass uses the signed-in API (the default); PR 467 hands the same
 * screen the guest operations of a public link, so a guest answers with exactly the same component and the same rules.
 */
export type ChecklistTakingApi = {
  submit: (instanceId: string, itemId: string, input: { checked?: boolean; scaleLevel?: number; photoUrl?: string; comment?: string }) => Promise<unknown>;
  uploadPhoto: (instanceId: string, itemId: string, file: File) => Promise<unknown>;
  removePhoto: (instanceId: string, itemId: string) => Promise<unknown>;
  finish: (instanceId: string) => Promise<unknown>;
  /** PR 510: voice recordings of the comment; without it the "Record sound" control is not drawn. */
  voice?: ChecklistVoiceApi;
};

const signedInTakingApi: ChecklistTakingApi = {
  submit: (instanceId, itemId, input) => submitChecklistItemResult(instanceId, itemId, input),
  uploadPhoto: (instanceId, itemId, file) => uploadChecklistItemPhoto(instanceId, itemId, file),
  removePhoto: (instanceId, itemId) => removeChecklistItemPhoto(instanceId, itemId),
  finish: (instanceId) => finishChecklistInstance(instanceId),
  voice: {
    list: (instanceId) => listChecklistVoiceNotes(instanceId),
    upload: (instanceId, itemId, blob, durationMs, replaceId) => uploadChecklistVoiceNote(instanceId, itemId, blob, durationMs, replaceId),
    blob: (instanceId, noteId) => getChecklistVoiceNoteBlob(instanceId, noteId),
    remove: (instanceId, noteId) => removeChecklistVoiceNote(instanceId, noteId),
    settings: (instanceId) => getChecklistVoiceSettings(instanceId),
  },
};

export function ChecklistTaking({
  instance,
  onBack,
  onUpdated,
  t,
  api = signedInTakingApi,
  photos = 'full',
  beforeFinish,
  onTransferred,
  onPreview,
}: {
  instance: ChecklistInstanceSummary;
  /** Without it the "back to the list" link is not drawn (a guest has no list). */
  onBack?: () => void;
  onUpdated: () => Promise<void>;
  t: TFunction;
  api?: ChecklistTakingApi;
  /** `full`: attach, preview, replace; `attach`: attach and replace without a preview (a guest cannot read the stored photo); `off`: no photo control. */
  photos?: 'full' | 'attach' | 'off';
  /** Extra content right above the finish bar (the guest's code check). */
  beforeFinish?: ReactNode;
  /** PR 477: given only for the signed-in employee's own pass; it turns on "Hand over the check…" and the hand-over history. */
  onTransferred?: () => void;
  /** PR 478: given only for the signed-in employee's own pass; it turns on the "Preview" button (the report of the filled-in sheet). */
  onPreview?: () => void;
}) {
  const checklist = instance.checklist;
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // PR 415: the explanation being typed, and an answer held back until a required explanation is filled.
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [pendingAnswers, setPendingAnswers] = useState<Record<string, { checked?: boolean; scaleLevel?: number }>>({});
  // PR 510: the voice recordings of this check; a recording counts as the explanation of its criterion.
  const [voiceNotes, setVoiceNotes] = useState<ChecklistVoiceNote[]>([]);
  const voiceApi = api.voice;
  const voiceSettings = useVoiceSettings(voiceApi, instance.id);
  const reloadVoice = useCallback(async () => {
    if (!voiceApi) return;
    try { const list = await voiceApi.list(instance.id); setVoiceNotes(Array.isArray(list) ? list : []); } catch { /* the recordings are an extra: the check itself keeps working */ }
  }, [voiceApi, instance.id]);
  useEffect(() => { void reloadVoice(); }, [reloadVoice]);

  if (!checklist) return null;
  const voiceItemIds = new Set(voiceNotes.filter((note) => note.place === 'answer' && note.itemId).map((note) => note.itemId as string));
  const numbering = checklistNumbers(checklist.items, checklist.itemGroups ?? []);
  const resultFor = (itemId: string) => findResultForItem(instance.results, itemId);
  const { completedRequired, requiredCount } = getRequiredChecklistProgress(
    checklist.items,
    instance.results,
    checklist.scoringMode,
    voiceItemIds,
  );
  const editable = instance.status === 'assigned' || instance.status === 'in_progress';
  async function submit(item: ChecklistItemSummary, input: { checked?: boolean; scaleLevel?: number; photoUrl?: string; comment?: string }) {
    setSubmitting(item.id);
    setError(null);
    try {
      await api.submit(instance.id, item.id, input);
      setPendingAnswers((current) => without(current, item.id));
      setNoteDrafts((current) => without(current, item.id));
      await onUpdated();
    } catch (err) {
      setError(localizeChecklistScaleError(err instanceof ApiClientError ? err.message : t('checklists.submitError', 'Unable to save this item.'), t));
    } finally {
      setSubmitting(null);
    }
  }
  /** An answer that needs a required explanation waits for it; otherwise it is saved at once (with the typed explanation, if any). */
  function choose(item: ChecklistItemSummary, input: { checked?: boolean; scaleLevel?: number }, hasScale: boolean) {
    const typed = noteDrafts[item.id];
    const note = typed ?? resultFor(item.id)?.comment ?? '';
    if (isNoteRequired(item, pendingAnswer(input), hasScale) && !note.trim() && !voiceItemIds.has(item.id)) {
      setPendingAnswers((current) => ({ ...current, [item.id]: input }));
      return;
    }
    setPendingAnswers((current) => without(current, item.id));
    void submit(item, typed === undefined ? input : { ...input, comment: typed });
  }
  async function uploadPhoto(item: ChecklistItemSummary, file: File) {
    setError(null);
    const invalid = validateChecklistPhoto(file);
    if (invalid) { setError(checklistPhotoErrorMessage(invalid, t)); return; }
    setSubmitting(item.id);
    try {
      await api.uploadPhoto(instance.id, item.id, file);
      await onUpdated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('checklists.photoUploadError', 'Unable to attach this photo.'));
    } finally {
      setSubmitting(null);
    }
  }
  const missingTitles = checklist.items
    .filter((item) => !isChecklistRequirementSatisfied(item, checklist.scoringMode, checklistResultToAnswer(resultFor(item.id), voiceItemIds.has(item.id))))
    .map((item) => item.text);
  async function finish() {
    setError(null);
    try {
      await api.finish(instance.id);
      await onUpdated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('checklists.finishError', 'Unable to finish the check.'));
    }
  }
  async function removePhoto(item: ChecklistItemSummary) {
    setError(null);
    setSubmitting(item.id);
    try {
      await api.removePhoto(instance.id, item.id);
      await onUpdated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('checklists.photoRemoveError', 'Unable to remove this photo.'));
    } finally {
      setSubmitting(null);
    }
  }
  return (
    <div>
      {onBack && (
        <button type="button" onClick={onBack} style={{ border: 'none', background: 'none', color: COLORS.primary, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 16 }}>
          ← {t('checklists.backToList', 'All checklists')}
        </button>
      )}
      <AppearanceBlock appearance={checklist.appearance} kind="header" style={{ marginBottom: 8 }}>
      {/* PR 421/445: extra pictures of the sheet, visible during the pass, first, above the title. */}
      {checklist.showSheetPhotos !== false && checklist.photos && checklist.photos.length > 0 && <ChecklistPhotoStrip checklistId={checklist.id} photos={checklist.photos} title={checklist.title} />}
      <h1 style={{ color: COLORS.text, marginBottom: 4 }}><RichText value={checklist.title} /></h1>
      {checklist.description && <p style={{ color: COLORS.muted }}><RichDescription value={checklist.description} /></p>}
      </AppearanceBlock>
      <ChecklistDeadlineMeta instance={instance} />
      {instance.status === 'expired' && (
        <p style={{ color: 'var(--color-danger-text)', background: 'var(--color-danger-soft)', borderRadius: 10, padding: '10px 12px' }} role="status">
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
      {error && <p style={{ color: 'var(--color-danger)' }} role="alert">{error}</p>}
      <div style={{ display: 'grid', gap: 12 }}>
        {checklist.items.map((item) => {
          const result = resultFor(item.id);
          const levels = checklistItemLevels(item, checklist.scoringMode, checklist.scaleLevels);
          const isDone = isChecklistAnswerComplete(item, checklist.scoringMode, checklistResultToAnswer(result, voiceItemIds.has(item.id)));
          return (
            <div
              key={item.id}
              style={itemCardStyle(checklist.appearance, item.id, {
                border: `1px solid ${COLORS.border}`,
                background: COLORS.surface,
                borderRadius: 14,
                padding: 16,
              }, COLORS.success, isDone)}
            >
              <p style={{ fontWeight: 600, marginTop: 0 }}>
                {checklistLabel(item.text, numbering.itemNumbers.get(item.id), checklist.showNumbering)}{' '}
                <span style={{ color: isDone ? COLORS.text : COLORS.muted, fontSize: 12, fontWeight: 500 }}>
                  {item.isRequired
                    ? t('checklists.requiredItem', 'Required')
                    : t('checklists.optionalItem', 'Optional')}
                </span>
              </p>
              <ChecklistItemDescription item={item} t={t} />
              {/* PR 448: the answer area is the one shared component, the same as in the preview and in the conduct screen. */}
              <CriterionOptions
                text={item.text} number={numbering.itemNumbers.get(item.id) ?? ''} required={item.isRequired} scoringMode={checklist.scoringMode}
                options={levels !== null ? levels.map((level) => ({ key: level.level, label: level.label, description: level.description, points: level.points ?? 0, color: level.color })) : yesNoOptions(t, checklist.scoringMode === 'all_required' ? 1 : item.points ?? 0)}
                selectedKey={levels !== null ? result?.scaleLevel ?? null : result?.checked ? 1 : result?.answerState === 'answered' ? 0 : null}
                disabled={!editable || submitting === item.id} canClear={false} clearLabel=""
                onChoose={(key) => choose(item, levels !== null ? { scaleLevel: key } : { checked: key === 1 }, levels !== null)}
                onClear={() => undefined}
              />
              {(() => {
                const held = pendingAnswers[item.id];
                const shown = held ? pendingAnswer(held) : checklistResultToAnswer(result);
                if (!isNoteOffered(item, shown, levels !== null)) return null;
                const required = isNoteRequired(item, shown, levels !== null);
                const text = noteDrafts[item.id] ?? result?.comment ?? '';
                return (
                  <div style={{ marginTop: 10 }}>
                    <ChecklistNoteField
                      disabled={!editable || submitting === item.id}
                      hint={held ? t('checklists.notePending', 'Fill in the explanation and save it: your answer is saved together with it.') : undefined}
                      id={`note-${item.id}`}
                      onChange={(value) => setNoteDrafts((current) => ({ ...current, [item.id]: value }))}
                      required={required}
                      t={t}
                      value={text}
                      dictation={voiceSettings.dictation}
                    />
                    <Button
                      disabled={!editable || submitting === item.id || text === (result?.comment ?? '') && !held || (required && !text.trim() && !voiceItemIds.has(item.id))}
                      onClick={() => void submit(item, held ? { ...held, comment: text } : { comment: text })}
                      size="sm"
                      style={{ marginTop: 6, minHeight: 44 }}
                      type="button"
                      variant="secondary"
                    >
                      {t('checklists.noteSave', 'Save explanation')}
                    </Button>
                    {api.voice && (
                      <ChecklistVoiceNotes
                        api={api.voice}
                        editable={editable && submitting !== item.id}
                        instanceId={instance.id}
                        itemId={item.id}
                        notes={voiceNotes.filter((note) => note.place === 'answer' && note.itemId === item.id)}
                        onChanged={() => void reloadVoice()}
                        settings={voiceSettings}
                        t={t}
                      />
                    )}
                  </div>
                );
              })()}
              {item.photoRequired && photos !== 'off' && (
                <PhotoAttachment
                  instanceId={instance.id}
                  item={item}
                  result={result}
                  cameraOnly={checklist.forbidGalleryPhotos === true}
                  previewable={photos === 'full'}
                  editable={editable}
                  busy={submitting === item.id}
                  onSelectFile={(file) => void uploadPhoto(item, file)}
                  onRemove={() => void removePhoto(item)}
                  t={t}
                />
              )}
            </div>
          );
        })}
      </div>
      {onPreview && (
        <Button type="button" variant="secondary" style={{ minHeight: 44, marginTop: 12, marginRight: 8 }} onClick={onPreview}>{t('checklists.instanceReport.open', 'Preview')}</Button>
      )}
      {editable && onTransferred && <ChecklistTransferButton instanceId={instance.id} expectedUpdatedAt={instance.updatedAt} onTransferred={onTransferred} t={t} />}
      {onTransferred && <ChecklistTransferHistory instanceId={instance.id} t={t} />}
      {editable && beforeFinish}
      {editable && <ChecklistFinishBar requiresReview={checklist.requiresReview === true} missing={missingTitles} onFinish={finish} t={t} />}
      {instance.status === 'completed' && checklist.scoringMode === 'none' && (
        <div style={{ marginTop: 20, borderRadius: 14, padding: '16px 18px', background: COLORS.successSoft, color: 'var(--color-success)' }}>
          {t('checklists.finishedNoPointsDone', 'The check is completed')}
        </div>
      )}
      {instance.status === 'completed' && checklist.scoringMode !== 'none' && (
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
          <span>{instance.passed ? t('checklists.resultPassed', 'Passed') : t('checklists.resultNotPassed', 'Not passed')}</span>
          <strong>{checklistResultText(instance, checklist.showPointsToLearner === true, t)}</strong>
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
  previewable,
  editable,
  busy,
  onSelectFile,
  onRemove,
  t,
}: {
  instanceId: string;
  item: ChecklistItemSummary;
  result: ChecklistItemResultSummary | undefined;
  cameraOnly: boolean;
  previewable: boolean;
  editable: boolean;
  busy: boolean;
  onSelectFile: (file: File) => void;
  onRemove: () => void;
  t: TFunction;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const attached = Boolean(result?.photoFileName);
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
      {attached && !previewable ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: COLORS.text }}>{t('checklists.photoAttached', 'Photo attached')}</span>
          <Button disabled={!canAct} onClick={() => inputRef.current?.click()} size="sm" style={{ minHeight: 44 }} type="button" variant="secondary">{t('checklists.photoReplace', 'Replace')}</Button>
        </div>
      ) : attached ? (
        <ChecklistPhotoProof
          instanceId={instanceId}
          itemId={item.id}
          fileName={result?.photoFileName ?? ''}
          canChange={canAct}
          onReplace={() => inputRef.current?.click()}
          onRemove={onRemove}
          t={t}
        />
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
