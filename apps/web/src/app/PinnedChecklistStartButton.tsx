import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiClientError } from '../shared/apiClient.js';
import { startFreeChecklist } from '../shared/api/checklists.js';
import type { FreeChecklistSummary } from '../shared/api/types.js';

/**
 * PR 354 follow-up: on the learner home a pinned tile starts (or continues) the checklist itself and
 * opens it on the checklists page. The start is the same idempotent call the checklists page uses, so a
 * second click never creates a second instance.
 */
export function PinnedChecklistStartButton({ item }: { item: FreeChecklistSummary }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const instanceId = item.activeInstanceId ?? (await startFreeChecklist(item.id)).id;
      window.location.assign(`/learn/checklists?open=${encodeURIComponent(instanceId)}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('checklists.free.startError', 'Unable to start this checklist.'));
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="ds-button ds-button--secondary ds-button--sm" disabled={busy} onClick={() => void run()}>
        {item.activeInstanceId ? t('learner.dashboard.pinnedChecklists.continue') : t('learner.dashboard.pinnedChecklists.open')}
      </button>
      {error && <p role="alert" style={{ color: '#b91c1c', margin: '6px 0 0', fontSize: 13 }}>{error}</p>}
    </div>
  );
}
