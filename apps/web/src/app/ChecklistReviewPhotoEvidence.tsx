import { useState } from 'react';
import type { TFunction } from 'i18next';

import { ApiClientError } from '../shared/apiClient.js';
import { getChecklistItemPhotoUrl } from '../shared/api/checklists.js';
import type { ChecklistItemResultSummary } from '../shared/api/types.js';
import { hasChecklistPhotoEvidence } from './checklistPhotoEvidence.js';

type EvidenceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; url: string }
  | { status: 'error'; message: string };

export function ChecklistReviewPhotoEvidence({
  instanceId,
  itemId,
  result,
  t,
}: {
  instanceId: string;
  itemId: string;
  result: ChecklistItemResultSummary;
  t: TFunction;
}) {
  const [state, setState] = useState<EvidenceState>({ status: 'idle' });
  const attached = hasChecklistPhotoEvidence(result);

  if (!attached) return null;

  async function loadPhoto() {
    setState({ status: 'loading' });
    try {
      const response = await getChecklistItemPhotoUrl(instanceId, itemId);
      setState({ status: 'loaded', url: response.url });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof ApiClientError
          ? error.message
          : t('checklistReview.photoLoadError', 'Unable to open this photo.'),
      });
    }
  }

  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{result.photoFileName}</span>
        <button
          type="button"
          onClick={() => void loadPhoto()}
          disabled={state.status === 'loading'}
          style={{ border: 'none', background: 'none', color: '#4f46e5', fontWeight: 600, cursor: 'pointer', padding: 0 }}
        >
          {state.status === 'loading'
            ? t('checklistReview.photoLoading', 'Opening photo...')
            : state.status === 'error'
              ? t('checklistReview.photoRetry', 'Retry photo')
              : t('checklistReview.photoOpen', 'Open photo')}
        </button>
      </div>
      {state.status === 'error' && <p role="alert" style={{ color: '#dc2626', margin: 0 }}>{state.message}</p>}
      {state.status === 'loaded' && (
        <a href={state.url} target="_blank" rel="noreferrer" aria-label={t('checklistReview.photoOpenNewTab', 'Open photo in a new tab')}>
          <img
            src={state.url}
            alt={result.photoFileName ?? t('checklistReview.photoEvidence', 'Checklist photo evidence')}
            style={{ width: 160, maxHeight: 120, objectFit: 'cover', borderRadius: 10, border: '1px solid #e3e8ef' }}
          />
        </a>
      )}
    </div>
  );
}
