import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { ApiClientError } from '../shared/apiClient.js';
import { getChecklistItemPhotoUrl, listMyChecklistInstances, submitChecklistItemResult, uploadChecklistItemPhoto } from '../shared/api/checklists.js';
import type { ChecklistInstanceSummary, ChecklistItemResultSummary, ChecklistItemSummary } from '../shared/api/types.js';
import { PageState } from '../shared/ui.js';
import { useAsyncData } from '../shared/useAsyncData.js';

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
  warning: '#d97706',
  warningSoft: '#fff7e8',
  primarySoft: '#eef2ff',
};

type LearnerChecklistsData = { instances: ChecklistInstanceSummary[] };

export function LearnerChecklistsPage() {
  const { t } = useTranslation();
  const [openInstanceId, setOpenInstanceId] = useState<string | null>(null);

  const { state: loadState, reload: load } = useAsyncData<LearnerChecklistsData>(
    async () => ({ instances: await listMyChecklistInstances() }),
    [t],
    {
      unauthenticated: t('checklists.sessionExpired', 'Your session has expired. Please sign in again.'),
      error: t('checklists.loadError', 'Unable to load your checklists.'),
    },
  );

  if (loadState.status === 'loading') {
    return <main style={{ padding: 32 }}><PageState message={t('checklists.loading', 'Loading checklists...')} variant="loading" /></main>;
  }
  if (loadState.status === 'unauthenticated' || loadState.status === 'notFound' || loadState.status === 'error') {
    return <main style={{ padding: 32 }}><PageState title={t('checklists.title', 'Checklists')} message={loadState.message} variant="error" /></main>;
  }

  const open = openInstanceId ? loadState.data.instances.find((i) => i.id === openInstanceId) : null;

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

      {loadState.data.instances.length === 0 ? (
        <PageState message={t('checklists.empty', 'You have no checklists assigned yet.')} />
      ) : (
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
      )}
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
  const answeredCount = instance.results.length;
  const totalCount = checklist.items.length;
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
    setSubmitting(item.id);
    setError(null);
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
        <div style={{ flex: 1, height: 8, borderRadius: 999, background: COLORS.soft, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: COLORS.primary, width: `${totalCount ? (answeredCount / totalCount) * 100 : 0}%` }} />
        </div>
        <span style={{ fontSize: 12.5, color: COLORS.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {answeredCount} / {totalCount}
        </span>
      </div>

      {error && <p style={{ color: '#dc2626' }} role="alert">{error}</p>}

      <div style={{ display: 'grid', gap: 12 }}>
        {checklist.items.map((item) => {
          const result = resultFor(item.id);
          const isDone = Boolean(result);
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
              <p style={{ fontWeight: 600, marginTop: 0 }}>{item.text}</p>

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
  editable,
  busy,
  onSelectFile,
  t,
}: {
  instanceId: string;
  item: ChecklistItemSummary;
  result: ChecklistItemResultSummary | undefined;
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
        accept="image/*"
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
          </span>
        </div>
      )}
    </div>
  );
}
