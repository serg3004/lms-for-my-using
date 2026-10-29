import { useId, useRef, useState, type FormEvent } from 'react';
import type { TFunction } from 'i18next';

import { ApiClientError } from '../../shared/apiClient.js';
import { deleteChecklistResult, listDeletedChecklistResults, restoreChecklistResult } from '../../shared/api/checklists.js';
import type { DeletedChecklistResult } from '../../shared/api/checklists.js';
import { formatDate } from '../../shared/formatDate.js';
import { useAsyncData } from '../../shared/useAsyncData.js';
import { Button, Dialog } from '../../shared/ui.js';
import { formatParticipantName } from './domain.js';

/** PR 367: an administrator deletes a finished result with a reason. The server keeps it restorable for 30 days. */
export function DeleteResultDialog({ open, instanceId, onClose, onDeleted, t }: {
  open: boolean; instanceId: string; onClose: () => void; onDeleted: () => void; t: TFunction;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog initialFocusRef={closeRef} labelledBy={titleId} onClose={onClose} open={open}>
      <h2 id={titleId}>{t('admin.checklists.resultDelete.title', 'Delete result')}</h2>
      <DeleteResultForm key={open ? 'open' : 'closed'} instanceId={instanceId} onClose={onClose} onDeleted={onDeleted} closeRef={closeRef} t={t} />
    </Dialog>
  );
}

function DeleteResultForm({ instanceId, onClose, onDeleted, closeRef, t }: {
  instanceId: string; onClose: () => void; onDeleted: () => void; closeRef: React.RefObject<HTMLButtonElement | null>; t: TFunction;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = reason.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (trimmed.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteChecklistResult(instanceId, trimmed);
      onDeleted();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t('admin.checklists.resultDelete.error', 'Unable to delete the result.'));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => { void submit(event); }} style={{ display: 'grid', gap: 8 }}>
      <p className="admin-form__hint">{t('admin.checklists.resultDelete.hint', 'The result disappears from reports, exports and analytics. You can restore it within 30 days.')}</p>
      <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>
        {t('admin.checklists.resultDelete.reason', 'Reason')}
        <textarea className="admin-input" disabled={busy} maxLength={500} onChange={(event) => setReason(event.target.value)} required rows={3} value={reason} />
      </label>
      {error && <p className="learner-quiz__submit-error" role="alert">{error}</p>}
      <div className="ds-dialog__actions">
        <button className="ds-button ds-button--secondary ds-button--md" disabled={busy} onClick={onClose} ref={closeRef} type="button">{t('admin.checklists.close', 'Close')}</button>
        <Button aria-busy={busy || undefined} disabled={busy || trimmed.length < 3} type="submit" variant="danger">{t('admin.checklists.resultDelete.confirm', 'Delete result')}</Button>
      </div>
    </form>
  );
}

/** PR 367: results an administrator deleted, with the reason and a restore action. Hidden while there are none. */
export function DeletedChecklistResults({ t }: { t: TFunction }) {
  const { state, reload } = useAsyncData<DeletedChecklistResult[]>(
    async () => (await listDeletedChecklistResults()).items,
    [],
    { unauthenticated: '', error: t('admin.checklists.resultDelete.loadError', 'Unable to load deleted results.') },
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state.status !== 'loaded' || state.data.length === 0) return null;

  async function restore(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await restoreChecklistResult(id);
      reload();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t('admin.checklists.resultDelete.restoreError', 'Unable to restore the result.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <details className="admin-card" style={{ marginBottom: 16 }}>
      <summary>{t('admin.checklists.resultDelete.listTitle', 'Deleted results ({{count}})', { count: state.data.length })}</summary>
      {error && <p className="learner-quiz__submit-error" role="alert">{error}</p>}
      <ul className="admin-checklist-instances">
        {state.data.map((row) => (
          <li key={row.id}>
            <div>
              <b>{row.checklist.title}</b>
              <span className="admin-form__hint"> {formatParticipantName(row.user)} · {row.percentage}%</span>
              <p className="admin-form__hint">
                {t('admin.checklists.resultDelete.meta', '{{reason}} · deleted {{date}}, can be restored until {{until}}', {
                  reason: row.reason,
                  date: formatDate(row.deletedAt, undefined, { dateStyle: 'medium' }),
                  until: formatDate(row.restorableUntil, undefined, { dateStyle: 'medium' }),
                })}
              </p>
            </div>
            <Button disabled={busyId !== null} onClick={() => void restore(row.id)} type="button" variant="secondary">{t('admin.checklists.resultDelete.restore', 'Restore')}</Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
